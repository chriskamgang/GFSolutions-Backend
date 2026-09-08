import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
  ) {}

  // Generer un numero de compte : 11 chiffres (2 agence + 2 type + 7 chrono)
  private async generateAccountNumber(agencyId: string, productCode: string): Promise<string> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    // Code agence en 2 chiffres (ex: "001" -> "01", "DLA" -> "01")
    const rawCode = agency?.code || '01';
    const agencyNum = rawCode.replace(/\D/g, '').padStart(2, '0').slice(-2) || '01';

    // Code type produit en 2 chiffres
    const typeMap: Record<string, string> = { CC: '10', EP: '20', DAT: '30', SAL: '40', JT: '50', ASS: '60', INS: '70', SCO: '80' };
    const typeNum = typeMap[productCode] || '10';

    // Chrono sequentiel sur 7 chiffres (basé sur le dernier numéro existant)
    const lastAccount = await this.prisma.account.findFirst({
      where: { agencyId },
      orderBy: { accountNumber: 'desc' },
      select: { accountNumber: true },
    });
    let nextNum = 1;
    if (lastAccount?.accountNumber) {
      const lastChrono = parseInt(lastAccount.accountNumber.slice(-7), 10);
      nextNum = lastChrono + 1;
    }
    const chrono = nextNum.toString().padStart(7, '0');

    return `${agencyNum}${typeNum}${chrono}`;
  }

  async getProducts(includeInactive = false) {
    return this.prisma.accountProduct.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { accounts: true } } },
      orderBy: { type: 'asc' },
    });
  }

  async createProduct(data: any) {
    return this.prisma.accountProduct.create({ data });
  }

  async updateProduct(id: string, data: any) {
    return this.prisma.accountProduct.update({ where: { id }, data });
  }

  async toggleProduct(id: string) {
    const product = await this.prisma.accountProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produit non trouve');
    return this.prisma.accountProduct.update({
      where: { id },
      data: { isActive: !product.isActive },
    });
  }

  async findAll(params: { type?: string; status?: string; page?: number; limit?: number }) {
    const { type, status, page = 1, limit = 20 } = params;
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        include: { client: true, agency: true, product: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.account.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findByClient(clientId: string) {
    return this.prisma.account.findMany({
      where: { clientId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { client: true, product: true },
    });
    if (!account) throw new NotFoundException('Compte non trouve');
    return account;
  }

  async getBalance(id: string) {
    const account = await this.findOne(id);
    return {
      accountNumber: account.accountNumber,
      balance: account.balance,
      type: account.type,
      status: account.status,
    };
  }

  async createAccount(params: {
    clientId: string;
    agencyId: string;
    productId: string;
    managerId?: string;
    initialDeposit?: number;
    maturityDate?: string;
  }) {
    const { clientId, agencyId, productId, managerId, initialDeposit, maturityDate } = params;

    // Verifier que le produit existe
    const product = await this.prisma.accountProduct.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Produit de compte non trouve');

    // Verifier qu'il n'a pas deja un compte actif avec ce produit (sauf DAT qui peut etre multiple)
    if (product.type !== 'DAT') {
      const existingAccount = await this.prisma.account.findFirst({
        where: { clientId, productId, status: 'ACTIVE' },
      });
      if (existingAccount) {
        throw new BadRequestException(
          `Ce client possede deja un compte "${product.name}" actif (N° ${existingAccount.accountNumber}). Un seul compte de ce type est autorise par client.`,
        );
      }
    }

    const openingFees = Number(product.openingFees) || 0;
    // Compte salaire ou scolarite : pas de depot minimum obligatoire a l'ouverture
    const minDeposit = (product.type === 'SALARY' || product.type === 'SCOLARITE') ? 0 : (Number(product.minOpeningDeposit) || 0);

    // Si depot initial demande, verifier qu'il couvre frais + depot minimum
    if (initialDeposit !== undefined && initialDeposit > 0) {
      const totalRequired = openingFees + minDeposit;
      if (initialDeposit < totalRequired) {
        throw new BadRequestException(
          `Le montant verse doit couvrir les frais d'ouverture (${openingFees.toLocaleString('fr-FR')} FCFA) + le depot minimum (${minDeposit.toLocaleString('fr-FR')} FCFA) = ${totalRequired.toLocaleString('fr-FR')} FCFA`,
        );
      }
    }

    // Generer le numero de compte
    const accountNumber = await this.generateAccountNumber(agencyId, product.code);

    // Calculer le solde net (depot - frais d'ouverture)
    const grossDeposit = initialDeposit || 0;
    const netBalance = grossDeposit > 0 ? grossDeposit - openingFees : 0;

    // Creer le compte
    const account = await this.prisma.account.create({
      data: {
        accountNumber,
        clientId,
        agencyId,
        productId,
        type: product.type,
        interestRate: Number(product.interestRate) || undefined,
        maturityDate: maturityDate ? new Date(maturityDate) : undefined,
        managerId: managerId || undefined,
        balance: netBalance,
      },
      include: { client: true, product: true },
    });

    // Creer les ecritures comptables si depot initial
    if (grossDeposit > 0) {
      const ref = `OUV-${accountNumber}`;
      const now = new Date();
      const entryNum = `EC-${Date.now()}`;

      try {
        // Trouver les comptes du plan comptable
        // Plan comptable EMF : 10x=Caisse, 22x=Depots clientele, 702=Commissions et frais
        const compteCaisse = await this.prisma.accountPlan.findFirst({ where: { code: { startsWith: '10' } } });
        const compteDepot = await this.prisma.accountPlan.findFirst({ where: { code: { startsWith: '22' } } });
        const compteCommissions = await this.prisma.accountPlan.findFirst({ where: { code: '702' } });

        if (compteCaisse && compteDepot) {
          // Ecriture : Debit Caisse / Credit Depot client
          await this.prisma.journalEntry.createMany({
            data: [
              {
                entryNumber: `${entryNum}-1`,
                date: now,
                accountId: compteCaisse.id,
                debit: grossDeposit,
                credit: 0,
                label: `Ouverture ${product.name} - Depot initial`,
                reference: ref,
                sourceModule: 'ACCOUNT_OPENING',
                sourceId: account.id,
                agencyId,
              },
              {
                entryNumber: `${entryNum}-2`,
                date: now,
                accountId: compteDepot.id,
                debit: 0,
                credit: grossDeposit,
                label: `Ouverture ${product.name} - Depot initial`,
                reference: ref,
                sourceModule: 'ACCOUNT_OPENING',
                sourceId: account.id,
                agencyId,
              },
            ],
          });

          // Ecriture frais d'ouverture : Debit Depot client / Credit Commissions
          if (openingFees > 0 && compteCommissions) {
            await this.prisma.journalEntry.createMany({
              data: [
                {
                  entryNumber: `${entryNum}-3`,
                  date: now,
                  accountId: compteDepot.id,
                  debit: openingFees,
                  credit: 0,
                  label: `Frais ouverture ${product.name}`,
                  reference: `FRAIS-${ref}`,
                  sourceModule: 'ACCOUNT_OPENING',
                  sourceId: account.id,
                  agencyId,
                },
                {
                  entryNumber: `${entryNum}-4`,
                  date: now,
                  accountId: compteCommissions.id,
                  debit: 0,
                  credit: openingFees,
                  label: `Frais ouverture ${product.name}`,
                  reference: `FRAIS-${ref}`,
                  sourceModule: 'ACCOUNT_OPENING',
                  sourceId: account.id,
                  agencyId,
                },
              ],
            });
          }
        }
      } catch { /* Silent si plan comptable pas encore configure */ }
    }

    // Envoi SMS de confirmation d'ouverture de compte
    try {
      const client = account.client;
      const phone = client.phone;
      if (phone) {
        const clientName = client.clientType === 'MORALE'
          ? client.raisonSociale
          : `${client.firstName} ${client.lastName}`;
        const smsMsg = `Bonjour ${clientName}, votre ${product.name} N° ${accountNumber} a ete ouvert avec succes chez GFS.${netBalance > 0 ? ` Solde: ${netBalance.toLocaleString('fr-FR')} FCFA.` : ''} Merci de votre confiance. GFS`;
        this.smsService.send(phone, smsMsg).catch(() => {});
      }
    } catch { /* Silent */ }

    return {
      account,
      product,
      openingFees,
      grossDeposit,
      netBalance,
      message: `Compte ${product.name} ouvert avec succes${openingFees > 0 ? ` (frais d'ouverture : ${openingFees.toLocaleString('fr-FR')} FCFA deduits)` : ''}`,
    };
  }

  async updatePhoneNumbers(accountId: string, phoneNumbers: string[]) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Compte non trouve');

    // Nettoyer les numeros (garder uniquement les chiffres, dedoublonner)
    const cleaned = [...new Set(
      phoneNumbers
        .map(p => p.replace(/[^0-9+]/g, ''))
        .filter(p => p.length >= 9)
    )];

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: { phoneNumbers: cleaned },
    });

    return {
      accountNumber: updated.accountNumber,
      phoneNumbers: updated.phoneNumbers,
      message: `${cleaned.length} numero(s) associe(s) au compte`,
    };
  }

  async createSavingsAccount(
    clientId: string,
    agencyId: string,
    interestRate: number,
  ) {
    return this.prisma.account.create({
      data: {
        accountNumber: await this.generateAccountNumber(agencyId, 'EP'),
        clientId,
        agencyId,
        type: 'SAVINGS',
        interestRate,
      },
    });
  }

  async createDATAccount(
    clientId: string,
    agencyId: string,
    interestRate: number,
    maturityDate: Date,
  ) {
    return this.prisma.account.create({
      data: {
        accountNumber: await this.generateAccountNumber(agencyId, 'DAT'),
        clientId,
        agencyId,
        type: 'DAT',
        interestRate,
        maturityDate,
      },
    });
  }
}
