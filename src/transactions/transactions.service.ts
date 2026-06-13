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

  private async calculateFees(amount: number, transactionType: string, channel: string = 'CASH'): Promise<{ fees: number; tax: number }> {
    // Try to find specific config for type+channel
    let config = await this.prisma.feeConfig.findFirst({
      where: { transactionType, channel, isActive: true },
    });
    // Fallback to type+ALL
    if (!config) {
      config = await this.prisma.feeConfig.findFirst({
        where: { transactionType, channel: 'ALL', isActive: true },
      });
    }

    let fees: number;
    if (config) {
      if (config.feeType === 'PERCENTAGE') {
        fees = Math.round(amount * Number(config.feeValue) / 100);
      } else {
        fees = Number(config.feeValue);
      }
      // Apply min/max
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
    const { fees, tax } = await this.calculateFees(dto.amount, 'DEPOSIT', channel);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: dto.toAccountId },
        data: { balance: { increment: dto.amount } },
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
    const { fees, tax } = await this.calculateFees(dto.amount, 'WITHDRAWAL', channel);
    const totalDebit = dto.amount + fees + tax;

    if (new Prisma.Decimal(totalDebit).gt(account.balance)) {
      throw new BadRequestException('Solde insuffisant');
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

    const { fees, tax } = await this.calculateFees(dto.amount, 'TRANSFER', 'CASH');
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
    const phone = account.client.phone;
    const accountNumber = account.accountNumber;

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
}
