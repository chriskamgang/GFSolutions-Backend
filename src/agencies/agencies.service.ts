import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgenciesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    code: string;
    address: string;
    city: string;
    region: string;
    phone: string;
    email?: string;
    parentId?: string;
  }) {
    const existing = await this.prisma.agency.findUnique({
      where: { code: data.code },
    });
    if (existing) throw new ConflictException('Ce code agence existe deja');

    return this.prisma.agency.create({
      data,
      include: { parent: true },
    });
  }

  async findAll() {
    return this.prisma.agency.findMany({
      include: {
        parent: true,
        _count: { select: { clients: true, users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        _count: { select: { clients: true, users: true, transactions: true } },
      },
    });
    if (!agency) throw new NotFoundException('Agence non trouvee');
    return agency;
  }

  async update(id: string, data: Partial<{
    name: string;
    address: string;
    city: string;
    region: string;
    phone: string;
    email: string;
    isActive: boolean;
  }>) {
    await this.findOne(id);
    return this.prisma.agency.update({
      where: { id },
      data,
      include: { parent: true },
    });
  }

  /**
   * Consolidation en temps reel : resume par agence
   */
  async getConsolidatedView() {
    const agencies = await this.prisma.agency.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { clients: true, users: true, transactions: true, accounts: true } },
      },
      orderBy: { name: 'asc' },
    });

    const result: any[] = [];

    for (const agency of agencies) {
      // Soldes par type de compte
      const [currentBal, savingsBal, datBal] = await Promise.all([
        this.prisma.account.aggregate({ _sum: { balance: true }, where: { agencyId: agency.id, type: 'CURRENT', status: 'ACTIVE' } }),
        this.prisma.account.aggregate({ _sum: { balance: true }, where: { agencyId: agency.id, type: 'SAVINGS', status: 'ACTIVE' } }),
        this.prisma.account.aggregate({ _sum: { balance: true }, where: { agencyId: agency.id, type: 'DAT', status: 'ACTIVE' } }),
      ]);

      // Credits en cours
      const creditsAgg = await this.prisma.credit.aggregate({
        _sum: { remainingAmount: true },
        _count: true,
        where: {
          status: { in: ['DISBURSED', 'ACTIVE'] },
          client: { agencyId: agency.id },
        },
      });

      // Transactions du mois
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const txMonth = await this.prisma.transaction.aggregate({
        _sum: { amount: true, fees: true },
        _count: true,
        where: { agencyId: agency.id, status: 'COMPLETED', createdAt: { gte: startOfMonth } },
      });

      // Caisses ouvertes
      const openRegisters = await this.prisma.cashRegister.count({
        where: { agencyId: agency.id, status: 'OPEN' },
      });

      // Coffre-fort
      const vault = await this.prisma.vault.findUnique({ where: { agencyId: agency.id } });

      result.push({
        id: agency.id,
        name: agency.name,
        code: agency.code,
        city: agency.city,
        region: agency.region,
        isActive: agency.isActive,
        counts: agency._count,
        soldes: {
          courant: Number(currentBal._sum.balance || 0),
          epargne: Number(savingsBal._sum.balance || 0),
          dat: Number(datBal._sum.balance || 0),
          total: Number(currentBal._sum.balance || 0) + Number(savingsBal._sum.balance || 0) + Number(datBal._sum.balance || 0),
        },
        credits: {
          count: creditsAgg._count || 0,
          encours: Number(creditsAgg._sum.remainingAmount || 0),
        },
        activiteMois: {
          volume: Number(txMonth._sum.amount || 0),
          frais: Number(txMonth._sum.fees || 0),
          nbTransactions: txMonth._count || 0,
        },
        caissesOuvertes: openRegisters,
        soldeCoffre: vault ? Number(vault.balance) : 0,
      });
    }

    // Totaux consolides
    const totals = result.reduce((acc, a) => ({
      clients: acc.clients + a.counts.clients,
      comptes: acc.comptes + a.counts.accounts,
      deposTotal: acc.deposTotal + a.soldes.total,
      creditsEncours: acc.creditsEncours + a.credits.encours,
      volumeMois: acc.volumeMois + a.activiteMois.volume,
      fraisMois: acc.fraisMois + a.activiteMois.frais,
    }), { clients: 0, comptes: 0, deposTotal: 0, creditsEncours: 0, volumeMois: 0, fraisMois: 0 });

    return { agencies: result, consolide: totals };
  }

  /**
   * Transfert inter-agences : un client qui opere dans une autre agence
   * Cree une transaction tracee avec l'agence source et destination
   */
  async interAgencyTransfer(dto: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    notes?: string;
  }, userId: string) {
    const fromAccount = await this.prisma.account.findUnique({
      where: { id: dto.fromAccountId },
      include: { agency: true, client: true },
    });
    const toAccount = await this.prisma.account.findUnique({
      where: { id: dto.toAccountId },
      include: { agency: true, client: true },
    });

    if (!fromAccount || !toAccount) {
      throw new NotFoundException('Compte source ou destination non trouve');
    }
    if (fromAccount.agencyId === toAccount.agencyId) {
      throw new BadRequestException('Les deux comptes sont dans la meme agence, utilisez un transfert normal');
    }
    if (Number(fromAccount.balance) < dto.amount) {
      throw new BadRequestException(`Solde insuffisant (${Number(fromAccount.balance)} FCFA)`);
    }

    const reference = `ITA-${Date.now().toString(36).toUpperCase()}`;

    const result = await this.prisma.$transaction(async (tx) => {
      // Debiter le compte source
      await tx.account.update({
        where: { id: dto.fromAccountId },
        data: { balance: { decrement: dto.amount } },
      });

      // Crediter le compte destination
      await tx.account.update({
        where: { id: dto.toAccountId },
        data: { balance: { increment: dto.amount } },
      });

      // Creer la transaction de debit
      const txDebit = await tx.transaction.create({
        data: {
          reference: `${reference}-D`,
          type: 'TRANSFER',
          amount: dto.amount,
          fees: 0,
          tax: 0,
          status: 'COMPLETED',
          fromAccountId: dto.fromAccountId,
          toAccountId: dto.toAccountId,
          agencyId: fromAccount.agencyId,
          description: `Transfert inter-agence vers ${toAccount.agency.name} - ${dto.notes || ''}`,
        },
      });

      // Creer la transaction de credit
      const txCredit = await tx.transaction.create({
        data: {
          reference: `${reference}-C`,
          type: 'TRANSFER',
          amount: dto.amount,
          fees: 0,
          tax: 0,
          status: 'COMPLETED',
          fromAccountId: dto.fromAccountId,
          toAccountId: dto.toAccountId,
          agencyId: toAccount.agencyId,
          description: `Transfert inter-agence depuis ${fromAccount.agency.name} - ${dto.notes || ''}`,
        },
      });

      return { txDebit, txCredit };
    });

    return {
      message: 'Transfert inter-agence effectue',
      reference,
      fromAgency: fromAccount.agency.name,
      toAgency: toAccount.agency.name,
      amount: dto.amount,
    };
  }

  /**
   * Parametres centralises du siege
   * Retourne les parametres globaux configurables
   */
  async getGlobalSettings() {
    // FeeConfigs globaux
    const feeConfigs = await this.prisma.feeConfig.findMany({ where: { isActive: true } });

    // Produits de credit
    const creditProducts = await this.prisma.creditProduct.findMany({ where: { isActive: true } });

    // Produits d'epargne
    const savingsProducts = await this.prisma.savingsProduct.findMany();

    // Agences
    const agencies = await this.prisma.agency.findMany({
      select: { id: true, name: true, code: true, isActive: true },
      orderBy: { name: 'asc' },
    });

    return {
      feeConfigs,
      creditProducts,
      savingsProducts,
      agencies,
      summary: {
        totalFeeConfigs: feeConfigs.length,
        totalCreditProducts: creditProducts.length,
        totalSavingsProducts: savingsProducts.length,
        totalAgencies: agencies.length,
        activeAgencies: agencies.filter(a => a.isActive).length,
      },
    };
  }
}
