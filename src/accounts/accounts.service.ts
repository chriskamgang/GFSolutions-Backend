import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  // Generer un numero de compte : CodeAgence-CodeProduit-Chrono
  private async generateAccountNumber(agencyId: string, productCode: string): Promise<string> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    const agencyCode = agency?.code || '001';

    // Compter les comptes existants pour ce produit dans cette agence
    const count = await this.prisma.account.count({
      where: { agencyId, product: { code: productCode } },
    });
    const chrono = (count + 1).toString().padStart(6, '0');

    return `${agencyCode}-${productCode}-${chrono}`;
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
    const minDeposit = Number(product.minOpeningDeposit) || 0;

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

    return {
      account,
      product,
      openingFees,
      grossDeposit,
      netBalance,
      message: `Compte ${product.name} ouvert avec succes${openingFees > 0 ? ` (frais d'ouverture : ${openingFees.toLocaleString('fr-FR')} FCFA deduits)` : ''}`,
    };
  }

  async createSavingsAccount(
    clientId: string,
    agencyId: string,
    interestRate: number,
  ) {
    return this.prisma.account.create({
      data: {
        accountNumber: `SAV-${Date.now().toString().slice(-10)}`,
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
        accountNumber: `DAT-${Date.now().toString().slice(-10)}`,
        clientId,
        agencyId,
        type: 'DAT',
        interestRate,
        maturityDate,
      },
    });
  }
}
