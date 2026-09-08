import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { SmsService } from '../sms/sms.service';
import { DepositDto, WithdrawalDto, TransferDto, ExternalTransferDto, ApproveExternalTransferDto } from './dto/transaction.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AmlService } from '../aml/aml.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TransactionsService {
  private taxRate: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private accountingService: AccountingService,
    private auditService: AuditService,
    private smsService: SmsService,
    private notificationsService: NotificationsService,
    private amlService: AmlService,
  ) {
    this.taxRate = parseFloat(
      this.configService.get<string>('TAX_RATE', '19.25'),
    );
  }

  private generateReference(): string {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `TXN-${timestamp}-${random}`;
  }

  /**
   * Verifie que le montant ne depasse pas le plafond du role de l'utilisateur
   */
  private async checkTransactionLimit(userId: string, amount: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { select: { maxTransactionAmount: true, name: true } } },
    });
    if (!user?.role) return;

    const maxAmount = user.role.maxTransactionAmount ? Number(user.role.maxTransactionAmount) : null;
    if (maxAmount && amount > maxAmount) {
      throw new ForbiddenException(
        `Montant ${amount.toLocaleString('fr-FR')} FCFA depasse le plafond autorise pour le role ${user.role.name} (${maxAmount.toLocaleString('fr-FR')} FCFA). Contactez votre superviseur.`,
      );
    }
  }

  /**
   * Met a jour les totaux de la caisse ouverte du caissier
   */
  private async updateCashRegister(userId: string, type: 'DEPOSIT' | 'WITHDRAWAL', amount: number) {
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { userId, status: 'OPEN' },
    });
    if (!openRegister) return; // Pas de caisse ouverte, on ignore silencieusement

    const data = type === 'DEPOSIT'
      ? { totalDeposits: { increment: amount } }
      : { totalWithdrawals: { increment: amount } };

    await this.prisma.cashRegister.update({
      where: { id: openRegister.id },
      data,
    });
  }

  // Comptes exemptes de frais (depot & retrait)
  private static readonly FEE_EXEMPT_ACCOUNTS = new Set([
    '01100000127', // ORANGE MONEY BON
  ]);

  private async calculateFees(amount: number, transactionType: string, channel: string = 'CASH', accountType: string = 'ALL', accountNumber?: string, accountId?: string): Promise<{ fees: number; tax: number }> {
    // Verifier si le compte est exempte de frais
    if (accountNumber && TransactionsService.FEE_EXEMPT_ACCOUNTS.has(accountNumber)) {
      return { fees: 0, tax: 0 };
    }

    // Compte SCOLARITE : 0 frais sur tous les depots et retraits (seuls frais d'entretien preleves via scheduler)
    if (accountType === 'SCOLARITE') {
      return { fees: 0, tax: 0 };
    }

    // Compte SALARY : forfait 1000 FCFA au 1er depot du mois, 0 frais pour tout le reste
    if (accountType === 'SALARY') {
      // Retraits et transferts : toujours gratuit
      if (transactionType !== 'DEPOSIT') {
        return { fees: 0, tax: 0 };
      }
      // Depot : verifier s'il y a deja eu un depot ce mois-ci
      if (accountId) {
        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const depositThisMonth = await this.prisma.transaction.findFirst({
          where: {
            toAccountId: accountId,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            createdAt: { gte: firstOfMonth },
          },
        });
        if (depositThisMonth) {
          // Deja eu un depot ce mois → 0 frais
          return { fees: 0, tax: 0 };
        }
      }
      // 1er depot du mois → forfait 1000 FCFA, pas de TVA
      return { fees: 1000, tax: 0 };
    }

    // Chercher config specifique : type de transaction + canal + type de compte + tranche de montant
    const allConfigs = await this.prisma.feeConfig.findMany({
      where: { transactionType, isActive: true },
      orderBy: { minAmount: 'asc' },
    });

    // Filtrer par canal, type de compte et tranche de montant
    let config = allConfigs.find(c =>
      (c.channel === channel || c.channel === 'ALL') &&
      (c.accountType === accountType) &&
      amount >= Number(c.minAmount) &&
      (Number(c.maxAmount) === 0 || amount <= Number(c.maxAmount))
    );

    // Fallback : meme type de compte, canal ALL
    if (!config) {
      config = allConfigs.find(c =>
        c.channel === 'ALL' &&
        c.accountType === accountType &&
        amount >= Number(c.minAmount) &&
        (Number(c.maxAmount) === 0 || amount <= Number(c.maxAmount))
      );
    }

    // Fallback : accountType ALL (config generique)
    if (!config) {
      config = allConfigs.find(c =>
        (c.channel === channel || c.channel === 'ALL') &&
        c.accountType === 'ALL' &&
        amount >= Number(c.minAmount) &&
        (Number(c.maxAmount) === 0 || amount <= Number(c.maxAmount))
      );
    }

    // Dernier fallback : n'importe quelle config active pour ce type de transaction
    if (!config) {
      config = allConfigs.find(c =>
        (c.channel === channel || c.channel === 'ALL') &&
        c.accountType === 'ALL'
      );
    }

    let fees: number;
    if (config) {
      if (config.feeType === 'PERCENTAGE') {
        fees = Math.round(amount * Number(config.feeValue) / 100);
      } else {
        fees = Number(config.feeValue);
      }
      const minFee = Number(config.minFee);
      const maxFee = Number(config.maxFee);
      if (minFee > 0 && fees < minFee) fees = minFee;
      if (maxFee > 0 && fees > maxFee) fees = maxFee;
      const taxRate = Number(config.taxRate);
      const tax = Math.round(fees * taxRate / 100);
      return { fees, tax };
    }

    // Default: 1% + 19.25% TVA
    fees = Math.round(amount * 0.01);
    const tax = Math.round(fees * (this.taxRate / 100));
    return { fees, tax };
  }

  /**
   * Verifie si un compte appartient a une Personne Morale
   * et si le signataire est autorise a effectuer l'operation
   */
  private async verifySignataire(accountId: string, signataireId?: string, signataireVerifie?: boolean, amount?: number, signataireIds?: string[]) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { client: true },
    });

    if (!account) throw new NotFoundException('Compte non trouve');

    // Si le client est une Personne Morale, le signataire est obligatoire
    if (account.client.clientType === 'MORALE') {
      // Verifier la regle de signature conjointe (JOINT)
      if (account.client.signatureRule === 'JOINT') {
        if (!signataireIds || signataireIds.length < 2) {
          throw new BadRequestException(
            'Ce compte exige une signature conjointe (JOINT). Deux signataires autorises doivent valider cette operation. Veuillez fournir signataireIds avec au moins 2 IDs.'
          );
        }
        if (!signataireVerifie) {
          throw new BadRequestException(
            'La verification d\'identite et de signature des signataires est obligatoire'
          );
        }

        // Verifier chaque signataire
        const signataireNoms: string[] = [];
        for (const sId of signataireIds) {
          const mandataire = await this.prisma.mandataire.findFirst({
            where: {
              clientMoraleId: account.clientId,
              clientPhysiqueId: sId,
              isSignataire: true,
            },
            include: { clientPhysique: true },
          });

          if (!mandataire) {
            throw new ForbiddenException(
              `Le signataire ${sId} n'est pas un signataire autorise de cette entite`
            );
          }

          // Verifier le plafond du mandataire
          if (amount && mandataire.maxOperationAmount) {
            const plafond = Number(mandataire.maxOperationAmount);
            if (amount > plafond) {
              throw new ForbiddenException(
                `Le montant (${amount.toLocaleString('fr-FR')} FCFA) depasse le plafond autorise pour le mandataire ${mandataire.clientPhysique.firstName} ${mandataire.clientPhysique.lastName} (${plafond.toLocaleString('fr-FR')} FCFA)`
              );
            }
          }

          signataireNoms.push(`${mandataire.clientPhysique.firstName} ${mandataire.clientPhysique.lastName}`);
        }

        return {
          account,
          signataireNom: signataireNoms.join(', '),
          mandataireRole: null,
        };
      }

      // Regle SINGLE : un seul signataire suffit
      if (!signataireId && (!signataireIds || signataireIds.length === 0)) {
        throw new BadRequestException(
          'Un signataire autorise est obligatoire pour les operations sur un compte de Personne Morale'
        );
      }
      if (!signataireVerifie) {
        throw new BadRequestException(
          'La verification d\'identite et de signature du signataire est obligatoire'
        );
      }

      const effectiveSignataireId = signataireId || (signataireIds ? signataireIds[0] : undefined);

      // Verifier que le signataire est un mandataire autorise de cette personne morale
      const mandataire = await this.prisma.mandataire.findFirst({
        where: {
          clientMoraleId: account.clientId,
          clientPhysiqueId: effectiveSignataireId,
          isSignataire: true,
        },
        include: { clientPhysique: true },
      });

      if (!mandataire) {
        throw new ForbiddenException(
          'Cette personne n\'est pas un signataire autorise de cette entite'
        );
      }

      // Verifier le plafond du mandataire
      if (amount && mandataire.maxOperationAmount) {
        const plafond = Number(mandataire.maxOperationAmount);
        if (amount > plafond) {
          throw new ForbiddenException(
            `Le montant (${amount.toLocaleString('fr-FR')} FCFA) depasse le plafond autorise pour ce mandataire (${plafond.toLocaleString('fr-FR')} FCFA)`
          );
        }
      }

      return {
        account,
        signataireNom: `${mandataire.clientPhysique.firstName} ${mandataire.clientPhysique.lastName}`,
        mandataireRole: mandataire.role,
      };
    }

    return { account, signataireNom: null, mandataireRole: null };
  }

  /**
   * Retourne les signataires autorises d'un compte
   * (utilise par le frontend pour afficher la modale de verification)
   */
  async getSignataires(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { client: true },
    });

    if (!account) throw new NotFoundException('Compte non trouve');

    if (account.client.clientType !== 'MORALE') {
      return { isMorale: false, signatureRule: null, signataires: [] };
    }

    const mandataires = await this.prisma.mandataire.findMany({
      where: {
        clientMoraleId: account.clientId,
        isSignataire: true,
      },
      include: {
        clientPhysique: {
          select: {
            id: true,
            clientNumber: true,
            firstName: true,
            lastName: true,
            phone: true,
            profilePhoto: true,
            idDocumentType: true,
            idDocumentNumber: true,
          },
        },
      },
    });

    return {
      isMorale: true,
      raisonSociale: account.client.raisonSociale,
      formeJuridique: account.client.formeJuridique,
      signatureRule: account.client.signatureRule,
      signataireIdField: 'id',
      signataires: mandataires.map(m => ({
        id: m.clientPhysique.id,
        mandataireId: m.id,
        clientNumber: m.clientPhysique.clientNumber,
        firstName: m.clientPhysique.firstName,
        lastName: m.clientPhysique.lastName,
        phone: m.clientPhysique.phone,
        profilePhoto: m.clientPhysique.profilePhoto,
        idDocumentType: m.clientPhysique.idDocumentType,
        idDocumentNumber: m.clientPhysique.idDocumentNumber,
        role: m.role,
        signatureUrl: m.signatureUrl,
      })),
    };
  }

  /**
   * Verifie si le depot depasserait le plafond de caisse
   * Retourne { allowed, currentBalance, ceiling, excessAmount }
   */
  async checkCashCeiling(userId: string, depositAmount: number): Promise<{
    allowed: boolean;
    currentBalance: number;
    ceiling: number | null;
    excessAmount: number;
  }> {
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { userId, status: 'OPEN' },
    });
    if (!openRegister || !openRegister.cashCeiling) {
      return { allowed: true, currentBalance: 0, ceiling: null, excessAmount: 0 };
    }

    const currentBalance = Number(openRegister.openingBalance) + Number(openRegister.totalDeposits) - Number(openRegister.totalWithdrawals);
    const ceiling = Number(openRegister.cashCeiling);
    const projected = currentBalance + depositAmount;

    if (projected > ceiling) {
      return {
        allowed: false,
        currentBalance,
        ceiling,
        excessAmount: projected - ceiling,
      };
    }

    return { allowed: true, currentBalance, ceiling, excessAmount: 0 };
  }

  async deposit(dto: DepositDto, userId?: string) {
    // Verifier le plafond du role
    if (userId) await this.checkTransactionLimit(userId, dto.amount);

    const { account } = await this.verifySignataire(
      dto.toAccountId, dto.signataireId, dto.signataireVerifie, dto.amount, dto.signataireIds
    );

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Ce compte n\'est pas actif');
    }

    // Verification plafond de caisse
    if (!dto.mobileMoneyProvider) {
      if (userId) {
        const ceilingCheck = await this.checkCashCeiling(userId, dto.amount);
        if (!ceilingCheck.allowed) {
          throw new BadRequestException(
            `Plafond de caisse depasse. Solde actuel: ${ceilingCheck.currentBalance} FCFA, Plafond: ${ceilingCheck.ceiling} FCFA. ` +
            `Effectuez un delestage de ${ceilingCheck.excessAmount} FCFA vers le coffre-fort.`
          );
        }
      }
    }

    const channel = dto.mobileMoneyProvider || 'CASH';
    const { fees, tax } = await this.calculateFees(dto.amount, 'DEPOSIT', channel, account.type, account.accountNumber, dto.toAccountId);
    const totalFees = fees + tax;
    // Les frais sont deduits du montant credite sur le compte
    const netCredit = totalFees > 0 ? dto.amount - totalFees : dto.amount;

    if (netCredit <= 0) {
      throw new BadRequestException(`Le montant (${dto.amount} FCFA) ne couvre pas les frais (${totalFees} FCFA)`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: dto.toAccountId },
        data: { balance: { increment: netCredit } },
      });

      const transaction = await tx.transaction.create({
        data: {
          reference: this.generateReference(),
          type: 'DEPOSIT',
          amount: dto.amount,
          fees,
          tax,
          toAccountId: dto.toAccountId,
          mobileMoneyProvider: dto.mobileMoneyProvider,
          mobileMoneyPhone: dto.mobileMoneyPhone,
          agencyId: dto.agencyId,
          status: 'COMPLETED',
          description: dto.description || (dto.mobileMoneyProvider ? 'Depot via Mobile Money' : 'Depot en especes au guichet'),
          signataireId: dto.signataireId,
          signataireVerifie: dto.signataireVerifie || false,
        },
      });

      return transaction;
    });

    // Ecriture comptable automatique (hors transaction pour resilience)
    try {
      await this.accountingService.recordDeposit(
        dto.agencyId, dto.amount, fees, tax,
        result.reference, !!dto.mobileMoneyProvider,
      );
    } catch (e) {
      console.error(`[COMPTA] Echec ecriture depot ${result.reference}:`, e.message);
    }

    // Mise a jour de la caisse ouverte du caissier
    if (userId) {
      this.updateCashRegister(userId, 'DEPOSIT', dto.amount).catch((e) =>
        console.error('[CAISSE]', e.message),
      );
    }

    // Piste d'audit
    if (userId) {
      this.auditService.log({ userId, action: 'CREATE', module: 'TRANSACTIONS', entityId: result.id, entityType: 'Transaction', details: `Depot ${dto.amount} FCFA - ${result.reference}` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    // SMS alerte depot
    this.sendTransactionSms(dto.toAccountId, 'DEPOSIT', dto.amount).catch((e) =>
      console.error('[SMS]', e.message),
    );

    // Analyse LAB/FT
    const toAccount = await this.prisma.account.findUnique({ where: { id: dto.toAccountId }, select: { clientId: true } });
    if (toAccount) {
      this.amlService.analyzeTransaction(result.id, dto.amount, toAccount.clientId, 'DEPOSIT').catch((e) =>
        console.error('[AML]', e.message),
      );
    }

    return result;
  }

  async withdrawal(dto: WithdrawalDto, userId?: string) {
    // Bloquer les retraits pour le role CAISSIER_DEPOT
    if (userId) {
      const operateur = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: { select: { name: true } } },
      });
      if (operateur?.role?.name === 'CAISSIER_DEPOT') {
        throw new ForbiddenException('Votre role (Caissier Depot) ne permet pas d\'effectuer des retraits');
      }
    }

    // Verifier le plafond du role
    if (userId) await this.checkTransactionLimit(userId, dto.amount);

    const { account } = await this.verifySignataire(
      dto.fromAccountId, dto.signataireId, dto.signataireVerifie, dto.amount, dto.signataireIds
    );

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Ce compte n\'est pas actif');
    }

    // Verifier plafonds retrait (produit de compte)
    if (account.productId) {
      const product = await this.prisma.accountProduct.findUnique({ where: { id: account.productId } });
      if (product) {
        if (product.maxWithdrawalPerTransaction && new Prisma.Decimal(dto.amount).gt(product.maxWithdrawalPerTransaction)) {
          throw new BadRequestException(`Montant depasse le plafond par operation (${product.maxWithdrawalPerTransaction} FCFA)`);
        }
        if (product.maxWithdrawalPerDay) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayWithdrawals = await this.prisma.transaction.aggregate({
            where: {
              fromAccountId: dto.fromAccountId,
              type: 'WITHDRAWAL',
              status: 'COMPLETED',
              createdAt: { gte: today },
            },
            _sum: { amount: true },
          });
          const totalToday = Number(todayWithdrawals._sum.amount || 0) + dto.amount;
          if (new Prisma.Decimal(totalToday).gt(product.maxWithdrawalPerDay)) {
            throw new BadRequestException(`Plafond retrait journalier depasse (${product.maxWithdrawalPerDay} FCFA). Deja retire aujourd'hui: ${Number(todayWithdrawals._sum.amount || 0)} FCFA`);
          }
        }
      }
    }

    const channel = dto.mobileMoneyProvider || 'CASH';
    const { fees, tax } = await this.calculateFees(dto.amount, 'WITHDRAWAL', channel, account.type, account.accountNumber, dto.fromAccountId);
    const totalDebit = dto.amount + fees + tax;

    if (new Prisma.Decimal(totalDebit).gt(account.balance)) {
      throw new BadRequestException(`Solde insuffisant. Solde: ${account.balance} FCFA, Montant a debiter: ${totalDebit} FCFA`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: dto.fromAccountId },
        data: { balance: { decrement: totalDebit } },
      });

      const transaction = await tx.transaction.create({
        data: {
          reference: this.generateReference(),
          type: 'WITHDRAWAL',
          amount: dto.amount,
          fees,
          tax,
          fromAccountId: dto.fromAccountId,
          mobileMoneyProvider: dto.mobileMoneyProvider,
          mobileMoneyPhone: dto.mobileMoneyPhone,
          agencyId: dto.agencyId,
          status: 'COMPLETED',
          description: dto.description || (dto.mobileMoneyProvider ? 'Retrait vers Mobile Money' : 'Retrait en especes au guichet'),
          signataireId: dto.signataireId,
          signataireVerifie: dto.signataireVerifie || false,
        },
      });

      return transaction;
    });

    // Ecriture comptable automatique
    try {
      await this.accountingService.recordWithdrawal(
        dto.agencyId, dto.amount, fees, tax,
        result.reference, !!dto.mobileMoneyProvider,
      );
    } catch (e) {
      console.error(`[COMPTA] Echec ecriture retrait ${result.reference}:`, e.message);
    }

    // Mise a jour de la caisse ouverte du caissier
    if (userId) {
      this.updateCashRegister(userId, 'WITHDRAWAL', dto.amount).catch((e) =>
        console.error('[CAISSE]', e.message),
      );
    }

    // Piste d'audit
    if (userId) {
      this.auditService.log({ userId, action: 'CREATE', module: 'TRANSACTIONS', entityId: result.id, entityType: 'Transaction', details: `Retrait ${dto.amount} FCFA - ${result.reference}` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    // SMS alerte retrait
    this.sendTransactionSms(dto.fromAccountId, 'WITHDRAWAL', dto.amount).catch((e) =>
      console.error('[SMS]', e.message),
    );

    // Analyse LAB/FT
    const fromAccount = await this.prisma.account.findUnique({ where: { id: dto.fromAccountId }, select: { clientId: true } });
    if (fromAccount) {
      this.amlService.analyzeTransaction(result.id, dto.amount, fromAccount.clientId, 'WITHDRAWAL').catch((e) =>
        console.error('[AML]', e.message),
      );
    }

    return result;
  }

  async transfer(dto: TransferDto, userId?: string) {
    // Bloquer les transferts pour le role CAISSIER_DEPOT
    if (userId) {
      const operateur = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: { select: { name: true } } },
      });
      if (operateur?.role?.name === 'CAISSIER_DEPOT') {
        throw new ForbiddenException('Votre role (Caissier Depot) ne permet pas d\'effectuer des transferts');
      }
    }

    // Verifier le plafond du role
    if (userId) await this.checkTransactionLimit(userId, dto.amount);

    // Verifier le signataire sur le compte source
    const { account: fromAccount } = await this.verifySignataire(
      dto.fromAccountId, dto.signataireId, dto.signataireVerifie, dto.amount, dto.signataireIds
    );

    const toAccount = await this.prisma.account.findUnique({
      where: { id: dto.toAccountId },
    });

    if (!toAccount) {
      throw new NotFoundException('Compte destination non trouve');
    }
    if (fromAccount.status !== 'ACTIVE' || toAccount.status !== 'ACTIVE') {
      throw new BadRequestException('Les deux comptes doivent etre actifs');
    }

    const { fees, tax } = await this.calculateFees(dto.amount, 'TRANSFER', 'CASH', fromAccount.type);
    const totalDebit = dto.amount + fees + tax;

    if (new Prisma.Decimal(totalDebit).gt(fromAccount.balance)) {
      throw new BadRequestException('Solde insuffisant');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: dto.fromAccountId },
        data: { balance: { decrement: totalDebit } },
      });

      await tx.account.update({
        where: { id: dto.toAccountId },
        data: { balance: { increment: dto.amount } },
      });

      const transaction = await tx.transaction.create({
        data: {
          reference: this.generateReference(),
          type: 'TRANSFER',
          amount: dto.amount,
          fees,
          tax,
          fromAccountId: dto.fromAccountId,
          toAccountId: dto.toAccountId,
          agencyId: dto.agencyId,
          status: 'COMPLETED',
          description: dto.description || 'Transfert entre comptes',
          signataireId: dto.signataireId,
          signataireVerifie: dto.signataireVerifie || false,
        },
      });

      return transaction;
    });

    // Ecriture comptable : debit compte source, credit compte destination
    try {
      await this.accountingService.recordWithdrawal(
        dto.agencyId, dto.amount, fees, tax,
        result.reference, false,
      );
      await this.accountingService.recordDeposit(
        dto.agencyId, dto.amount, 0, 0,
        result.reference, false,
      );
    } catch (e) {
      console.error(`[COMPTA] Echec ecriture transfert ${result.reference}:`, e.message);
    }

    // Piste d'audit
    if (userId) {
      this.auditService.log({ userId, action: 'CREATE', module: 'TRANSACTIONS', entityId: result.id, entityType: 'Transaction', details: `Transfert ${dto.amount} FCFA - ${result.reference}` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    // SMS alerte transfert (expediteur + beneficiaire)
    this.sendTransactionSms(dto.fromAccountId, 'TRANSFER_SENT', dto.amount).catch((e) =>
      console.error('[SMS]', e.message),
    );
    this.sendTransactionSms(dto.toAccountId, 'TRANSFER_RECEIVED', dto.amount).catch((e) =>
      console.error('[SMS]', e.message),
    );

    return result;
  }

  /**
   * Envoie un SMS d'alerte au client proprietaire du compte
   */
  private async sendTransactionSms(
    accountId: string,
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_SENT' | 'TRANSFER_RECEIVED',
    amount: number,
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { client: true },
    });
    if (!account?.client?.phone) return;

    const balance = Number(account.balance);
    const accountNumber = account.accountNumber;

    // Collecter tous les numeros a notifier (principal + secondaire + numeros du compte)
    const phones = new Set<string>();
    phones.add(account.client.phone);
    if (account.client.phoneSecondaire) phones.add(account.client.phoneSecondaire);
    const accountPhones = account.phoneNumbers as string[] | null;
    if (Array.isArray(accountPhones)) {
      for (const p of accountPhones) {
        if (p) phones.add(p.startsWith('+') ? p : `+${p}`);
      }
    }

    const sendToPhone = (phone: string) => {
      switch (type) {
        case 'DEPOSIT':
          return this.smsService.sendDepositAlert(phone, accountNumber, amount, balance);
        case 'WITHDRAWAL':
          return this.smsService.sendWithdrawalAlert(phone, accountNumber, amount, balance);
        case 'TRANSFER_SENT':
          return this.smsService.sendTransferSentAlert(phone, accountNumber, amount, balance);
        case 'TRANSFER_RECEIVED':
          return this.smsService.sendTransferReceivedAlert(phone, accountNumber, amount, balance);
      }
    };

    // Envoyer a tous les numeros en parallele
    await Promise.allSettled([...phones].map(p => sendToPhone(p)));
  }

  // ==================== VIREMENT EXTERNE (Maker-Checker) ====================

  async createExternalTransfer(dto: ExternalTransferDto, userId: string) {
    // Verifier le plafond du role
    await this.checkTransactionLimit(userId, dto.amount);

    // Verifier le signataire si compte Personne Morale
    const { account } = await this.verifySignataire(
      dto.fromAccountId, dto.signataireId, dto.signataireVerifie, dto.amount, dto.signataireIds
    );

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Ce compte n\'est pas actif');
    }

    // Verifier que le solde est suffisant (montant + frais + taxe)
    const { fees, tax } = await this.calculateFees(dto.amount, 'EXTERNAL_TRANSFER', 'CASH');
    const totalDebit = dto.amount + fees + tax;

    if (new Prisma.Decimal(totalDebit).gt(account.balance)) {
      throw new BadRequestException('Solde insuffisant');
    }

    // Creer la transaction en statut PENDING (pas de debit encore)
    const transaction = await this.prisma.transaction.create({
      data: {
        reference: this.generateReference(),
        type: 'TRANSFER',
        amount: dto.amount,
        fees,
        tax,
        fromAccountId: dto.fromAccountId,
        agencyId: dto.agencyId,
        status: 'PENDING',
        description: `Virement externe vers ${dto.destinationBank} - ${dto.beneficiaryName}`,
        signataireId: dto.signataireId,
        signataireVerifie: dto.signataireVerifie || false,
        destinationBank: dto.destinationBank,
        destinationAccountNumber: dto.destinationAccountNumber,
        beneficiaryName: dto.beneficiaryName,
        motif: dto.motif,
      },
    });

    // Piste d'audit
    this.auditService.log({
      userId,
      action: 'CREATE',
      module: 'TRANSACTIONS',
      entityId: transaction.id,
      entityType: 'Transaction',
      details: `Virement externe ${dto.amount.toLocaleString('fr-FR')} FCFA vers ${dto.destinationBank} - ${dto.beneficiaryName} (en attente validation)`,
    }).catch((e) => console.error('[AUDIT]', e.message));

    // Notifier les chefs d'agence et directeurs pour validation
    this.notifyApprovers(dto.amount, dto.destinationBank, dto.beneficiaryName).catch((e) =>
      console.error('[NOTIFICATION]', e.message),
    );

    return transaction;
  }

  /**
   * Notifie les utilisateurs avec role CHEF_AGENCE ou DIRECTEUR_GENERAL
   * qu'un virement externe est en attente de validation
   */
  private async notifyApprovers(amount: number, bank: string, beneficiary: string) {
    const approvers = await this.prisma.user.findMany({
      where: {
        role: {
          name: { in: ['CHEF_AGENCE', 'DIRECTEUR_GENERAL'] },
        },
      },
    });

    const title = 'Virement externe en attente';
    const message = `Un virement externe de ${amount.toLocaleString('fr-FR')} FCFA vers ${bank} (${beneficiary}) est en attente de votre validation.`;

    for (const approver of approvers) {
      await this.notificationsService.notifyStaff(approver.id, title, message);
    }
  }

  async approveExternalTransfer(transactionId: string, dto: ApproveExternalTransferDto, userId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        fromAccount: { include: { client: true } },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction non trouvee');
    }

    if (transaction.status !== 'PENDING') {
      throw new BadRequestException('Cette transaction n\'est pas en attente de validation');
    }

    if (!transaction.destinationBank) {
      throw new BadRequestException('Cette transaction n\'est pas un virement externe');
    }

    if (dto.approved) {
      // Recalculer frais et taxe
      const amount = Number(transaction.amount);
      const { fees, tax } = await this.calculateFees(amount, 'EXTERNAL_TRANSFER', 'CASH');
      const totalDebit = amount + fees + tax;

      // Verifier que le solde est toujours suffisant
      const account = await this.prisma.account.findUnique({
        where: { id: transaction.fromAccountId! },
      });

      if (!account || new Prisma.Decimal(totalDebit).gt(account.balance)) {
        throw new BadRequestException('Solde insuffisant pour effectuer ce virement');
      }

      // Debiter le compte et mettre a jour la transaction
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: transaction.fromAccountId! },
          data: { balance: { decrement: totalDebit } },
        });

        return tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'COMPLETED',
            fees,
            tax,
            approvedById: userId,
            approvedAt: new Date(),
          },
        });
      });

      // Ecriture comptable
      try {
        await this.accountingService.recordWithdrawal(
          transaction.agencyId, amount, fees, tax,
          transaction.reference, false,
        );
      } catch (e) {
        console.error(`[COMPTA] Echec ecriture virement externe ${transaction.reference}:`, e.message);
      }

      // Piste d'audit
      this.auditService.log({
        userId,
        action: 'UPDATE',
        module: 'TRANSACTIONS',
        entityId: transactionId,
        entityType: 'Transaction',
        details: `Virement externe ${amount.toLocaleString('fr-FR')} FCFA vers ${transaction.destinationBank} - APPROUVE`,
      }).catch((e) => console.error('[AUDIT]', e.message));

      // SMS alerte au proprietaire du compte
      if (transaction.fromAccountId) {
        this.sendTransactionSms(transaction.fromAccountId, 'TRANSFER_SENT', amount).catch((e) =>
          console.error('[SMS]', e.message),
        );
      }

      return result;
    } else {
      // Rejet du virement
      const result = await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'CANCELLED',
          approvedById: userId,
          approvedAt: new Date(),
          rejectedReason: dto.comment,
        },
      });

      // Piste d'audit
      this.auditService.log({
        userId,
        action: 'UPDATE',
        module: 'TRANSACTIONS',
        entityId: transactionId,
        entityType: 'Transaction',
        details: `Virement externe ${Number(transaction.amount).toLocaleString('fr-FR')} FCFA vers ${transaction.destinationBank} - REJETE${dto.comment ? ` : ${dto.comment}` : ''}`,
      }).catch((e) => console.error('[AUDIT]', e.message));

      return result;
    }
  }

  async getPendingExternalTransfers(agencyId?: string) {
    const where: any = {
      status: 'PENDING',
      destinationBank: { not: null },
    };
    if (agencyId) {
      where.agencyId = agencyId;
    }

    return this.prisma.transaction.findMany({
      where,
      include: {
        fromAccount: { include: { client: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(params: {
    agencyId?: string;
    accountId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    isTest?: boolean;
  }) {
    const { agencyId, accountId, type, startDate, endDate, page = 1, limit = 20, isTest } = params;

    const where: any = {};
    if (agencyId) where.agencyId = agencyId;
    if (type) where.type = type;
    if (isTest !== undefined) where.isTest = isTest;
    if (accountId) {
      where.OR = [
        { fromAccountId: accountId },
        { toAccountId: accountId },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          fromAccount: { include: { client: true } },
          toAccount: { include: { client: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Releve de compte mensuel — liste toutes les transactions d'un compte pour un mois donne
   * avec solde d'ouverture, solde de cloture, et totaux depots/retraits
   */
  async getAccountStatement(accountId: string, year: number, month: number) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException('Compte non trouve');

    // Periode du mois
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Transactions du mois pour ce compte
    const transactions = await this.prisma.transaction.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: startDate, lte: endDate },
        OR: [
          { fromAccountId: accountId },
          { toAccountId: accountId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculer le solde d'ouverture :
    // = solde actuel - somme des mouvements apres le debut du mois
    const transactionsAfterStart = await this.prisma.transaction.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: startDate },
        OR: [
          { fromAccountId: accountId },
          { toAccountId: accountId },
        ],
      },
    });

    let netMovementAfterStart = 0;
    for (const tx of transactionsAfterStart) {
      const amount = Number(tx.amount);
      const fees = Number(tx.fees) + Number(tx.tax || 0);
      if (tx.toAccountId === accountId) {
        netMovementAfterStart += amount;
      }
      if (tx.fromAccountId === accountId) {
        netMovementAfterStart -= (amount + fees);
      }
    }

    const currentBalance = Number(account.balance);
    const openingBalance = currentBalance - netMovementAfterStart;

    // Calculer les totaux du mois
    let totalDepots = 0;
    let totalRetraits = 0;
    let totalFrais = 0;
    let nbDepots = 0;
    let nbRetraits = 0;

    const lignes = transactions.map(tx => {
      const amount = Number(tx.amount);
      const fees = Number(tx.fees) + Number(tx.tax || 0);
      let credit = 0;
      let debit = 0;

      if (tx.toAccountId === accountId) {
        credit = amount;
        totalDepots += amount;
        nbDepots++;
      }
      if (tx.fromAccountId === accountId) {
        debit = amount + fees;
        totalRetraits += amount;
        totalFrais += fees;
        nbRetraits++;
      }

      return {
        date: tx.createdAt,
        reference: tx.reference,
        type: tx.type,
        description: tx.description || '',
        debit,
        credit,
        fees,
      };
    });

    // Solde de cloture du mois
    let netMovementMonth = 0;
    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const fees = Number(tx.fees) + Number(tx.tax || 0);
      if (tx.toAccountId === accountId) netMovementMonth += amount;
      if (tx.fromAccountId === accountId) netMovementMonth -= (amount + fees);
    }
    const closingBalance = openingBalance + netMovementMonth;

    const clientName = account.client.clientType === 'MORALE'
      ? account.client.raisonSociale
      : `${account.client.firstName} ${account.client.lastName}`;

    return {
      compte: {
        accountNumber: account.accountNumber,
        accountType: account.type,
        clientName,
        clientId: account.client.id,
        clientType: account.client.clientType,
      },
      periode: {
        mois: month,
        annee: year,
        label: `${String(month).padStart(2, '0')}/${year}`,
        debut: startDate,
        fin: endDate,
      },
      soldeOuverture: openingBalance,
      soldeCloture: closingBalance,
      totalDepots,
      totalRetraits,
      totalFrais,
      nbDepots,
      nbRetraits,
      nbTransactions: transactions.length,
      lignes,
    };
  }

  /**
   * Historique complet des transactions d'un compte avec pagination
   */
  async getAccountHistory(accountId: string, params: {
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException('Compte non trouve');

    const { type, startDate, endDate, page = 1, limit = 50 } = params;
    const where: any = {
      status: 'COMPLETED',
      OR: [
        { fromAccountId: accountId },
        { toAccountId: accountId },
      ],
    };
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(Boolean);
      where.type = types.length === 1 ? types[0] : { in: types };
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    const clientName = account.client.clientType === 'MORALE'
      ? account.client.raisonSociale
      : `${account.client.firstName} ${account.client.lastName}`;

    const data = transactions.map(tx => {
      const amount = Number(tx.amount);
      const fees = Number(tx.fees) + Number(tx.tax || 0);
      let credit = 0;
      let debit = 0;
      if (tx.toAccountId === accountId) credit = amount;
      if (tx.fromAccountId === accountId) debit = amount + fees;

      return {
        id: tx.id,
        date: tx.createdAt,
        reference: tx.reference,
        type: tx.type,
        description: tx.description || '',
        debit,
        credit,
        fees,
        channel: tx.mobileMoneyProvider || 'CASH',
        status: tx.status,
      };
    });

    return {
      compte: {
        accountNumber: account.accountNumber,
        accountType: account.type,
        clientName,
        balance: Number(account.balance),
      },
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        fromAccount: { include: { client: true } },
        toAccount: { include: { client: true } },
      },
    });
    if (!transaction) throw new NotFoundException('Transaction non trouvee');
    return transaction;
  }

  // ==================== FEE CONFIG CRUD ====================

  async createFeeConfig(data: {
    name: string;
    transactionType: string;
    channel?: string;
    feeType?: string;
    feeValue: number;
    minFee?: number;
    maxFee?: number;
    taxRate?: number;
    isActive?: boolean;
  }) {
    return this.prisma.feeConfig.create({
      data: {
        name: data.name,
        transactionType: data.transactionType,
        channel: data.channel || 'ALL',
        feeType: data.feeType || 'PERCENTAGE',
        feeValue: data.feeValue,
        minFee: data.minFee || 0,
        maxFee: data.maxFee || 0,
        taxRate: data.taxRate ?? 19.25,
        isActive: data.isActive ?? true,
      },
    });
  }

  async findAllFeeConfigs() {
    return this.prisma.feeConfig.findMany({
      orderBy: [{ transactionType: 'asc' }, { channel: 'asc' }],
    });
  }

  async updateFeeConfig(id: string, data: {
    name?: string;
    transactionType?: string;
    channel?: string;
    feeType?: string;
    feeValue?: number;
    minFee?: number;
    maxFee?: number;
    taxRate?: number;
    isActive?: boolean;
  }) {
    const existing = await this.prisma.feeConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Configuration de frais non trouvee');
    return this.prisma.feeConfig.update({
      where: { id },
      data,
    });
  }

  // ==================== RECEIPT ====================

  async generateReceipt(transactionId: string) {
    const tx = await this.findOne(transactionId);

    const clientName = tx.fromAccount?.client
      ? (tx.fromAccount.client.clientType === 'MORALE'
          ? tx.fromAccount.client.raisonSociale
          : `${tx.fromAccount.client.firstName} ${tx.fromAccount.client.lastName}`)
      : tx.toAccount?.client
        ? (tx.toAccount.client.clientType === 'MORALE'
            ? tx.toAccount.client.raisonSociale
            : `${tx.toAccount.client.firstName} ${tx.toAccount.client.lastName}`)
        : 'N/A';

    return {
      receiptNumber: tx.reference,
      date: tx.createdAt,
      type: tx.type,
      typeLabel: {
        DEPOSIT: 'Depot',
        WITHDRAWAL: 'Retrait',
        TRANSFER: 'Transfert',
        SALARY_PAYMENT: 'Paiement salaire',
        LOAN_DISBURSEMENT: 'Decaissement credit',
        LOAN_REPAYMENT: 'Remboursement credit',
        FEE: 'Frais',
        INTEREST: 'Interets',
      }[tx.type] || tx.type,
      amount: Number(tx.amount),
      fees: Number(tx.fees),
      tax: Number(tx.tax),
      totalAmount: Number(tx.amount) + Number(tx.fees) + Number(tx.tax),
      clientName,
      fromAccount: tx.fromAccount?.accountNumber || null,
      toAccount: tx.toAccount?.accountNumber || null,
      channel: tx.mobileMoneyProvider || 'CASH',
      description: tx.description,
      status: tx.status,
      // External transfer info
      destinationBank: (tx as any).destinationBank || null,
      beneficiaryName: (tx as any).beneficiaryName || null,
      // Footer
      institution: 'MicroFinance Cameroun EMF',
      disclaimer: 'Ce recu fait foi de la transaction effectuee. Conservez-le precieusement.',
    };
  }

  // ==================== CONTRE-PASSATION ====================

  async reverseTransaction(transactionId: string, reason: string, userId: string) {
    const original = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { fromAccount: true, toAccount: true },
    });

    if (!original) throw new NotFoundException('Transaction non trouvee');
    if (original.status !== 'COMPLETED') {
      throw new BadRequestException('Seules les transactions completees peuvent etre contre-passees');
    }

    // Verifier qu'elle n'a pas deja ete contre-passee
    const alreadyReversed = await this.prisma.transaction.findFirst({
      where: { description: { contains: `CONTREPASSATION de ${original.reference}` } },
    });
    if (alreadyReversed) {
      throw new BadRequestException(`Cette transaction a deja ete contre-passee (ref: ${alreadyReversed.reference})`);
    }

    const amount = Number(original.amount);
    const fees = Number(original.fees);
    const tax = Number(original.tax || 0);
    const totalWithFees = amount + fees + tax;

    const result = await this.prisma.$transaction(async (tx) => {
      // Selon le type, inverser les mouvements
      if (original.type === 'DEPOSIT') {
        // Depot errone : on debite le compte qui avait ete credite
        if (!original.toAccountId) throw new BadRequestException('Compte destination introuvable');
        const account = await tx.account.findUnique({ where: { id: original.toAccountId } });
        if (Number(account!.balance) < amount) {
          throw new BadRequestException(`Solde insuffisant pour contre-passer. Solde actuel: ${account!.balance} FCFA, montant a debiter: ${amount} FCFA`);
        }
        await tx.account.update({
          where: { id: original.toAccountId },
          data: { balance: { decrement: amount } },
        });
      } else if (original.type === 'WITHDRAWAL') {
        // Retrait errone : on re-credite le compte + les frais
        if (!original.fromAccountId) throw new BadRequestException('Compte source introuvable');
        await tx.account.update({
          where: { id: original.fromAccountId },
          data: { balance: { increment: totalWithFees } },
        });
      } else if (original.type === 'TRANSFER' || original.type === 'SALARY_PAYMENT') {
        // Virement errone : on re-credite la source et debite la destination
        if (!original.fromAccountId || !original.toAccountId) {
          throw new BadRequestException('Comptes source/destination introuvables');
        }
        const toAccount = await tx.account.findUnique({ where: { id: original.toAccountId } });
        if (Number(toAccount!.balance) < amount) {
          throw new BadRequestException(`Solde insuffisant sur le compte destination pour contre-passer. Solde: ${toAccount!.balance} FCFA`);
        }
        // Re-crediter la source (montant + frais + taxe)
        await tx.account.update({
          where: { id: original.fromAccountId },
          data: { balance: { increment: totalWithFees } },
        });
        // Debiter la destination
        await tx.account.update({
          where: { id: original.toAccountId },
          data: { balance: { decrement: amount } },
        });
      } else {
        throw new BadRequestException(`Contre-passation non supportee pour le type: ${original.type}`);
      }

      // Marquer la transaction originale comme annulee
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: 'CANCELLED' },
      });

      // Creer la transaction de contre-passation
      const reversal = await tx.transaction.create({
        data: {
          reference: `REV-${this.generateReference()}`,
          type: original.type,
          amount: original.amount,
          fees: original.fees,
          tax: original.tax || 0,
          status: 'COMPLETED',
          fromAccountId: original.type === 'DEPOSIT' ? original.toAccountId : original.fromAccountId,
          toAccountId: original.type === 'WITHDRAWAL' ? original.fromAccountId : original.toAccountId,
          agencyId: original.agencyId,
          description: `CONTREPASSATION de ${original.reference} — Motif: ${reason}`,
        },
      });

      return reversal;
    });

    // Piste d'audit
    this.auditService.log({
      userId,
      action: 'UPDATE',
      module: 'TRANSACTIONS',
      entityId: transactionId,
      entityType: 'Transaction',
      details: `Contre-passation de ${original.reference} (${original.type}, ${amount} FCFA) — Motif: ${reason}`,
    }).catch((e) => console.error('[AUDIT]', e.message));

    return {
      message: `Transaction ${original.reference} contre-passee avec succes`,
      originalTransaction: original.reference,
      reversalTransaction: result.reference,
      amount,
      fees,
      tax,
      reason,
    };
  }
}
