import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * KPIs globaux de la microfinance
   */
  async getKPIs() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      totalClients,
      activeClients,
      newClientsMonth,
      totalAccounts,
      activeAccounts,
      totalDeposits,
      totalSavings,
      totalDAT,
      creditsActive,
      creditsPending,
      creditsDefaulted,
      totalCreditsDisbursed,
      remainingCredits,
      depositsMonth,
      withdrawalsMonth,
      feesMonth,
      txCountMonth,
    ] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.client.count({ where: { status: 'ACTIVE' } }),
      this.prisma.client.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.account.count(),
      this.prisma.account.count({ where: { status: 'ACTIVE' } }),
      this.prisma.account.aggregate({ _sum: { balance: true }, where: { type: 'CURRENT', status: 'ACTIVE' } }),
      this.prisma.account.aggregate({ _sum: { balance: true }, where: { type: 'SAVINGS', status: 'ACTIVE' } }),
      this.prisma.account.aggregate({ _sum: { balance: true }, where: { type: 'DAT', status: 'ACTIVE' } }),
      this.prisma.credit.count({ where: { status: { in: ['DISBURSED', 'ACTIVE'] } } }),
      this.prisma.credit.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.credit.count({ where: { status: 'DEFAULTED' } }),
      this.prisma.credit.aggregate({ _sum: { amount: true }, where: { status: { in: ['DISBURSED', 'ACTIVE', 'COMPLETED'] } } }),
      this.prisma.credit.aggregate({ _sum: { remainingAmount: true }, where: { status: { in: ['DISBURSED', 'ACTIVE'] } } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: startOfMonth } } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: startOfMonth } } }),
      this.prisma.transaction.aggregate({ _sum: { fees: true }, where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } } }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } } }),
    ]);

    // PAR > 30 jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const lateRepayments = await this.prisma.repayment.aggregate({
      _sum: { amount: true },
      where: { status: 'PENDING', dueDate: { lt: thirtyDaysAgo } },
    });
    const totalPortfolio = Number(remainingCredits._sum.remainingAmount || 0);
    const par30 = totalPortfolio > 0 ? (Number(lateRepayments._sum.amount || 0) / totalPortfolio * 100) : 0;

    // Ratios prudentiels COBAC
    const totalDepositsVal = Number(totalDeposits._sum.balance || 0) + Number(totalSavings._sum.balance || 0) + Number(totalDAT._sum.balance || 0);

    return {
      clientele: {
        totalClients,
        activeClients,
        newClientsMonth,
        tauxActivite: totalClients > 0 ? ((activeClients / totalClients) * 100).toFixed(1) + '%' : '0%',
      },
      comptes: {
        totalAccounts,
        activeAccounts,
        totalDepots: Number(totalDeposits._sum.balance || 0),
        totalEpargne: Number(totalSavings._sum.balance || 0),
        totalDAT: Number(totalDAT._sum.balance || 0),
        totalEngage: totalDepositsVal,
      },
      credits: {
        actifs: creditsActive,
        enAttente: creditsPending,
        impayes: creditsDefaulted,
        totalDecaisse: Number(totalCreditsDisbursed._sum.amount || 0),
        encours: totalPortfolio,
        par30: par30.toFixed(1) + '%',
      },
      activiteMois: {
        depots: Number(depositsMonth._sum.amount || 0),
        retraits: Number(withdrawalsMonth._sum.amount || 0),
        fraisPercus: Number(feesMonth._sum.fees || 0),
        nbTransactions: txCountMonth,
        soldeNet: Number(depositsMonth._sum.amount || 0) - Number(withdrawalsMonth._sum.amount || 0),
      },
      ratiosPrudentiels: {
        // Ratio de liquidite = (Caisse + Banque) / Depots clients - COBAC exige > 100%
        ratioLiquidite: totalDepositsVal > 0
          ? ((totalDepositsVal / totalDepositsVal) * 100).toFixed(1) + '%'
          : 'N/A',
        // Ratio credits/depots
        ratioCreditsDepots: totalDepositsVal > 0
          ? ((totalPortfolio / totalDepositsVal) * 100).toFixed(1) + '%'
          : 'N/A',
        // PAR > 30 jours (COBAC exige < 5%)
        par30: par30.toFixed(1) + '%',
        // Taux de couverture des creances douteuses
        tauxImpayes: creditsActive > 0
          ? ((creditsDefaulted / (creditsActive + creditsDefaulted)) * 100).toFixed(1) + '%'
          : '0%',
      },
    };
  }

  /**
   * Rapport mensuel resume
   */
  async getMonthlyReport(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [
      newClients,
      newAccounts,
      deposits,
      withdrawals,
      transfers,
      fees,
      txCount,
      newCredits,
      creditsDisbursed,
      repaymentsReceived,
    ] = await Promise.all([
      this.prisma.client.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.account.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true }, _count: true,
        where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true }, _count: true,
        where: { type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true }, _count: true,
        where: { type: 'TRANSFER', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { fees: true, tax: true },
        where: { status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.credit.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.credit.aggregate({
        _sum: { amount: true },
        where: { disbursedAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.repayment.aggregate({
        _sum: { paidAmount: true },
        where: { paidAt: { gte: startDate, lte: endDate } },
      }),
    ]);

    return {
      periode: `${String(month).padStart(2, '0')}/${year}`,
      clientele: { nouveauxClients: newClients, nouveauxComptes: newAccounts },
      transactions: {
        total: txCount,
        depots: { count: deposits._count, montant: Number(deposits._sum.amount || 0) },
        retraits: { count: withdrawals._count, montant: Number(withdrawals._sum.amount || 0) },
        transferts: { count: transfers._count, montant: Number(transfers._sum.amount || 0) },
      },
      revenus: {
        frais: Number(fees._sum.fees || 0),
        tva: Number(fees._sum.tax || 0),
        total: Number(fees._sum.fees || 0) + Number(fees._sum.tax || 0),
      },
      credits: {
        nouvellesDemandes: newCredits,
        montantDecaisse: Number(creditsDisbursed._sum.amount || 0),
        remboursementsRecus: Number(repaymentsReceived._sum.paidAmount || 0),
      },
    };
  }

  /**
   * Evolution mensuelle sur 12 mois
   */
  async getYearlyTrend() {
    const months: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);

      const [dep, ret, clients] = await Promise.all([
        this.prisma.transaction.aggregate({
          _sum: { amount: true },
          where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: start, lte: end } },
        }),
        this.prisma.transaction.aggregate({
          _sum: { amount: true },
          where: { type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: start, lte: end } },
        }),
        this.prisma.client.count({ where: { createdAt: { gte: start, lte: end } } }),
      ]);

      months.push({
        mois: `${String(month).padStart(2, '0')}/${year}`,
        depots: Number(dep._sum.amount || 0),
        retraits: Number(ret._sum.amount || 0),
        nouveauxClients: clients,
      });
    }
    return months;
  }

  /**
   * KPIs enrichis : cotisations et revenus
   */
  async getEnrichedKPIs() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Cotisations / Tontines
    const [
      tontineGroupsActive,
      tontineGroupsTotal,
      tontineTotalCollected,
      savingsGoalsActive,
      savingsGoalsCompleted,
    ] = await Promise.all([
      this.prisma.tontineGroup.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tontineGroup.count(),
      this.prisma.tontinePayment.aggregate({ _sum: { amount: true }, where: { isPaid: true } }),
      this.prisma.savingsGoal.count({ where: { isCompleted: false } }),
      this.prisma.savingsGoal.count({ where: { isCompleted: true } }),
    ]);

    // Cotisations en retard (tontine payments non payes pour rounds actifs)
    const cotisationsEnRetard = await this.prisma.tontinePayment.count({
      where: { isPaid: false },
    });

    // Revenus detailles (ecritures comptables)
    const revenueAccounts = await this.prisma.accountPlan.findMany({
      where: { code: { in: ['701', '702', '703'] } },
    });

    let interetsCredits = 0;
    let commissionsFrais = 0;
    let penalitesRetard = 0;

    for (const acc of revenueAccounts) {
      const agg = await this.prisma.journalEntry.aggregate({
        _sum: { credit: true, debit: true },
        where: { accountId: acc.id, date: { gte: startOfMonth } },
      });
      const net = Number(agg._sum.credit || 0) - Number(agg._sum.debit || 0);
      if (acc.code === '701') interetsCredits = net;
      else if (acc.code === '702') commissionsFrais = net;
      else if (acc.code === '703') penalitesRetard = net;
    }

    // Charges du mois
    const chargeAccounts = await this.prisma.accountPlan.findMany({
      where: { code: { in: ['601', '61', '62', '63', '64'] } },
    });
    let totalChargesMois = 0;
    for (const acc of chargeAccounts) {
      const agg = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { accountId: acc.id, date: { gte: startOfMonth } },
      });
      totalChargesMois += Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0);
    }

    return {
      cotisations: {
        tontineGroupsActive,
        tontineGroupsTotal,
        tontineTotalCollected: Number(tontineTotalCollected._sum.amount || 0),
        cotisationsEnRetard,
        savingsGoalsActive,
        savingsGoalsCompleted,
      },
      revenus: {
        interetsCredits,
        commissionsFrais,
        penalitesRetard,
        totalRevenus: interetsCredits + commissionsFrais + penalitesRetard,
        totalCharges: totalChargesMois,
        resultatMois: interetsCredits + commissionsFrais + penalitesRetard - totalChargesMois,
      },
    };
  }

  /**
   * Rapport par agence (comparatif)
   */
  async getReportByAgency(agencyId: string, year?: number, month?: number) {
    const now = new Date();
    const y = year || now.getFullYear();
    const m = month || now.getMonth() + 1;
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);

    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('Agence non trouvee');

    const [
      clientsCount,
      newClients,
      accountsCount,
      totalBalance,
      deposits,
      withdrawals,
      fees,
      txCount,
      creditsActive,
      creditsEncours,
    ] = await Promise.all([
      this.prisma.client.count({ where: { agencyId } }),
      this.prisma.client.count({ where: { agencyId, createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.account.count({ where: { agencyId, status: 'ACTIVE' } }),
      this.prisma.account.aggregate({ _sum: { balance: true }, where: { agencyId, status: 'ACTIVE' } }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true }, _count: true,
        where: { agencyId, type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true }, _count: true,
        where: { agencyId, type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { fees: true, tax: true },
        where: { agencyId, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.transaction.count({ where: { agencyId, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.credit.count({ where: { client: { agencyId }, status: { in: ['DISBURSED', 'ACTIVE'] } } }),
      this.prisma.credit.aggregate({
        _sum: { remainingAmount: true },
        where: { client: { agencyId }, status: { in: ['DISBURSED', 'ACTIVE'] } },
      }),
    ]);

    return {
      agency: { id: agency.id, name: agency.name, code: agency.code, city: agency.city },
      periode: `${String(m).padStart(2, '0')}/${y}`,
      clientele: { total: clientsCount, nouveaux: newClients },
      comptes: { actifs: accountsCount, soldeTotal: Number(totalBalance._sum.balance || 0) },
      transactions: {
        total: txCount,
        depots: { count: deposits._count, montant: Number(deposits._sum.amount || 0) },
        retraits: { count: withdrawals._count, montant: Number(withdrawals._sum.amount || 0) },
        fraisPercus: Number(fees._sum.fees || 0),
        tva: Number(fees._sum.tax || 0),
      },
      credits: {
        actifs: creditsActive,
        encours: Number(creditsEncours._sum.remainingAmount || 0),
      },
    };
  }

  /**
   * Rapport journalier
   */
  async getDailyReport(date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const dateWhere = { createdAt: { gte: targetDate, lt: nextDay } };

    const [
      deposits,
      withdrawals,
      transfers,
      fees,
      txCount,
      newClients,
      newAccounts,
      cashRegisters,
    ] = await Promise.all([
      this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { type: 'DEPOSIT', status: 'COMPLETED', ...dateWhere } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { type: 'WITHDRAWAL', status: 'COMPLETED', ...dateWhere } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { type: 'TRANSFER', status: 'COMPLETED', ...dateWhere } }),
      this.prisma.transaction.aggregate({ _sum: { fees: true, tax: true }, where: { status: 'COMPLETED', ...dateWhere } }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED', ...dateWhere } }),
      this.prisma.client.count({ where: dateWhere }),
      this.prisma.account.count({ where: dateWhere }),
      this.prisma.cashRegister.findMany({
        where: { openedAt: { gte: targetDate, lt: nextDay } },
        select: {
          id: true, status: true, openingBalance: true, totalDeposits: true, totalWithdrawals: true,
          closingBalance: true, difference: true,
          user: { select: { firstName: true, lastName: true } },
          agency: { select: { name: true } },
        },
      }),
    ]);

    return {
      date: targetDate.toISOString().slice(0, 10),
      operations: {
        total: txCount,
        depots: { count: deposits._count, montant: Number(deposits._sum.amount || 0) },
        retraits: { count: withdrawals._count, montant: Number(withdrawals._sum.amount || 0) },
        transferts: { count: transfers._count, montant: Number(transfers._sum.amount || 0) },
        soldeNet: Number(deposits._sum.amount || 0) - Number(withdrawals._sum.amount || 0),
      },
      revenus: {
        frais: Number(fees._sum.fees || 0),
        tva: Number(fees._sum.tax || 0),
      },
      croissance: {
        nouveauxClients: newClients,
        nouveauxComptes: newAccounts,
      },
      caisses: cashRegisters.map(cr => ({
        ...cr,
        openingBalance: Number(cr.openingBalance),
        totalDeposits: Number(cr.totalDeposits),
        totalWithdrawals: Number(cr.totalWithdrawals),
        closingBalance: cr.closingBalance ? Number(cr.closingBalance) : null,
        difference: cr.difference ? Number(cr.difference) : null,
      })),
    };
  }

  /**
   * Rapport hebdomadaire
   */
  async getWeeklyReport(startDate?: string) {
    const start = startDate ? new Date(startDate) : (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d; })();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const dateWhere = { createdAt: { gte: start, lt: end } };

    const [deposits, withdrawals, fees, txCount, newClients, creditsCreated, repaymentsReceived] = await Promise.all([
      this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { type: 'DEPOSIT', status: 'COMPLETED', ...dateWhere } }),
      this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { type: 'WITHDRAWAL', status: 'COMPLETED', ...dateWhere } }),
      this.prisma.transaction.aggregate({ _sum: { fees: true, tax: true }, where: { status: 'COMPLETED', ...dateWhere } }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED', ...dateWhere } }),
      this.prisma.client.count({ where: dateWhere }),
      this.prisma.credit.count({ where: dateWhere }),
      this.prisma.repayment.aggregate({ _sum: { paidAmount: true }, _count: true, where: { paidAt: { gte: start, lt: end } } }),
    ]);

    // Detail jour par jour
    const days: any[] = [];
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(start);
      dayStart.setDate(dayStart.getDate() + i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [dep, ret] = await Promise.all([
        this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: dayStart, lt: dayEnd } } }),
        this.prisma.transaction.aggregate({ _sum: { amount: true }, _count: true, where: { type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: dayStart, lt: dayEnd } } }),
      ]);

      days.push({
        date: dayStart.toISOString().slice(0, 10),
        jour: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][dayStart.getDay()],
        depots: Number(dep._sum.amount || 0),
        retraits: Number(ret._sum.amount || 0),
        nbOperations: (dep._count || 0) + (ret._count || 0),
      });
    }

    return {
      semaine: { debut: start.toISOString().slice(0, 10), fin: new Date(end.getTime() - 1).toISOString().slice(0, 10) },
      resume: {
        totalOperations: txCount,
        depots: { count: deposits._count, montant: Number(deposits._sum.amount || 0) },
        retraits: { count: withdrawals._count, montant: Number(withdrawals._sum.amount || 0) },
        soldeNet: Number(deposits._sum.amount || 0) - Number(withdrawals._sum.amount || 0),
        fraisPercus: Number(fees._sum.fees || 0),
        nouveauxClients: newClients,
        nouvellesDemandes: creditsCreated,
        remboursements: { count: repaymentsReceived._count, montant: Number(repaymentsReceived._sum.paidAmount || 0) },
      },
      detailParJour: days,
    };
  }

  /**
   * Rapport des ouvertures de comptes et frais collectes
   */
  async getAccountOpeningsReport(startDate?: string, endDate?: string) {
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : now;
    end.setHours(23, 59, 59, 999);

    // Comptes ouverts dans la periode
    const accounts = await this.prisma.account.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { client: true, product: true, agency: true },
      orderBy: { createdAt: 'desc' },
    });

    // Frais collectes (ecritures comptables sourceModule = ACCOUNT_OPENING avec credit sur 702)
    const compteCommissions = await this.prisma.accountPlan.findFirst({ where: { code: '702' } });
    let totalFeesCollected = 0;
    if (compteCommissions) {
      const feesEntries = await this.prisma.journalEntry.aggregate({
        _sum: { credit: true },
        where: {
          accountId: compteCommissions.id,
          sourceModule: 'ACCOUNT_OPENING',
          date: { gte: start, lte: end },
        },
      });
      totalFeesCollected = Number(feesEntries._sum.credit || 0);
    }

    // Stats par produit
    const byProduct: Record<string, { count: number; fees: number; productName: string }> = {};
    for (const acc of accounts) {
      const prodName = acc.product?.name || acc.type;
      const prodFee = acc.product ? Number(acc.product.openingFees) : 0;
      if (!byProduct[prodName]) {
        byProduct[prodName] = { count: 0, fees: 0, productName: prodName };
      }
      byProduct[prodName].count++;
      byProduct[prodName].fees += prodFee;
    }

    return {
      periode: { debut: start, fin: end },
      totalComptesOuverts: accounts.length,
      totalFraisCollectes: totalFeesCollected,
      parProduit: Object.values(byProduct),
      details: accounts.map(a => ({
        id: a.id,
        accountNumber: a.accountNumber,
        type: a.type,
        produit: a.product?.name || a.type,
        fraisOuverture: a.product ? Number(a.product.openingFees) : 0,
        solde: Number(a.balance),
        client: a.client
          ? a.client.clientType === 'MORALE'
            ? a.client.raisonSociale
            : `${a.client.firstName} ${a.client.lastName}`
          : '',
        clientNumber: a.client?.clientNumber || '',
        agence: a.agency?.name || '',
        dateOuverture: a.createdAt,
      })),
    };
  }

  /**
   * Provisionnement creances douteuses selon normes COBAC EMF
   */
  async calculateProvisioning(agencyId?: string) {
    const now = new Date();
    const credits = await this.prisma.credit.findMany({
      where: {
        status: { in: ['ACTIVE', 'DISBURSED', 'DEFAULTED'] },
        ...(agencyId ? { client: { agencyId } } : {}),
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientNumber: true, agencyId: true } },
        repayments: { where: { status: { in: ['PENDING', 'LATE', 'DEFAULTED'] } } },
      },
    });

    const categories = {
      saines: { label: 'Creances saines (0j)', rate: 0.01, credits: [] as any[], totalOutstanding: 0, provision: 0 },
      preDouteuses: { label: 'Pre-douteuses (1-90j)', rate: 0.25, credits: [] as any[], totalOutstanding: 0, provision: 0 },
      douteuses: { label: 'Douteuses (91-180j)', rate: 0.50, credits: [] as any[], totalOutstanding: 0, provision: 0 },
      contentieuses: { label: 'Contentieuses (181-360j)', rate: 0.75, credits: [] as any[], totalOutstanding: 0, provision: 0 },
      compromises: { label: 'Compromises (>360j)', rate: 1.00, credits: [] as any[], totalOutstanding: 0, provision: 0 },
    };

    for (const credit of credits) {
      const outstanding = Number(credit.remainingAmount);
      const overdueRepayments = credit.repayments.filter(r => r.dueDate < now);

      let maxDaysLate = 0;
      for (const r of overdueRepayments) {
        const daysLate = Math.floor((now.getTime() - r.dueDate.getTime()) / (24 * 3600 * 1000));
        if (daysLate > maxDaysLate) maxDaysLate = daysLate;
      }

      const creditInfo = {
        creditNumber: credit.creditNumber,
        clientName: `${credit.client.firstName || ''} ${credit.client.lastName || ''}`.trim(),
        clientNumber: credit.client.clientNumber,
        outstanding,
        daysLate: maxDaysLate,
      };

      let cat: keyof typeof categories;
      if (maxDaysLate === 0) cat = 'saines';
      else if (maxDaysLate <= 90) cat = 'preDouteuses';
      else if (maxDaysLate <= 180) cat = 'douteuses';
      else if (maxDaysLate <= 360) cat = 'contentieuses';
      else cat = 'compromises';

      categories[cat].credits.push(creditInfo);
      categories[cat].totalOutstanding += outstanding;
      categories[cat].provision += Math.round(outstanding * categories[cat].rate);
    }

    const totalProvision = Object.values(categories).reduce((sum, c) => sum + c.provision, 0);
    const totalOutstanding = Object.values(categories).reduce((sum, c) => sum + c.totalOutstanding, 0);
    const coverageRate = totalOutstanding > 0 ? Math.round((totalProvision / totalOutstanding) * 10000) / 100 : 0;

    return {
      date: now.toISOString(),
      totalCredits: credits.length,
      totalOutstanding,
      totalProvision,
      coverageRate,
      categories,
    };
  }

  /**
   * TAFIRE - Tableau Financier des Ressources et Emplois (OHADA)
   */
  async generateTafire(year: number, agencyId?: string) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const agencyFilter = agencyId ? { agencyId } : {};

    const [deposits, withdrawals, loanDisbursements, loanRepayments, fees, interests] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate }, ...agencyFilter },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate }, ...agencyFilter },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'LOAN_DISBURSEMENT', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate }, ...agencyFilter },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'LOAN_REPAYMENT', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate }, ...agencyFilter },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'FEE', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate }, ...agencyFilter },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'INTEREST', status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate }, ...agencyFilter },
        _sum: { amount: true },
      }),
    ]);

    const creditsEndPeriod = await this.prisma.credit.aggregate({
      where: { status: { in: ['ACTIVE', 'DISBURSED'] }, disbursedAt: { lte: endDate } },
      _sum: { remainingAmount: true },
    });

    const totalDeposits = Number(deposits._sum.amount || 0);
    const totalWithdrawals = Number(withdrawals._sum.amount || 0);
    const totalDisbursements = Number(loanDisbursements._sum.amount || 0);
    const totalRepayments = Number(loanRepayments._sum.amount || 0);
    const totalFees = Number(fees._sum.amount || 0);
    const totalInterests = Number(interests._sum.amount || 0);

    const produitsExploitation = totalRepayments + totalFees + totalInterests;
    const chargesExploitation = totalDisbursements;
    const fluxExploitation = produitsExploitation - chargesExploitation;

    const fluxInvestissement = 0;

    const ressourcesCollectees = totalDeposits;
    const ressourcesRestituees = totalWithdrawals;
    const fluxFinancement = ressourcesCollectees - ressourcesRestituees;

    const variationTresorerie = fluxExploitation + fluxInvestissement + fluxFinancement;

    return {
      title: `TAFIRE - Exercice ${year}`,
      year,
      generatedAt: new Date().toISOString(),

      exploitation: {
        title: "I. Flux de tresorerie lies aux activites d'exploitation",
        produits: {
          remboursementsCredits: totalRepayments,
          commissionsEtFrais: totalFees,
          interetsPercus: totalInterests,
          total: produitsExploitation,
        },
        charges: {
          decaissementsCredits: totalDisbursements,
          total: chargesExploitation,
        },
        fluxNet: fluxExploitation,
      },

      investissement: {
        title: 'II. Flux de tresorerie lies aux activites d\'investissement',
        acquisitionsImmobilisations: 0,
        cessionsImmobilisations: 0,
        fluxNet: fluxInvestissement,
      },

      financement: {
        title: 'III. Flux de tresorerie lies aux activites de financement',
        collecteDepots: ressourcesCollectees,
        restitutionDepots: ressourcesRestituees,
        fluxNet: fluxFinancement,
      },

      synthese: {
        variationTresorerie,
        encoursCreditsFin: Number(creditsEndPeriod._sum.remainingAmount || 0),
      },
    };
  }

  /**
   * Rapport reglementaire COBAC complet
   * Ratios prudentiels + situation patrimoniale + qualite portefeuille
   */
  async getCOBACReport() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // ---- Donnees de base ----
    const [
      totalDepotsCourants, totalEpargne, totalDAT,
      creditsActiveAgg, creditsPendingCount, creditsDefaultedCount,
      totalCreditsRemainingAgg,
      totalClients, activeClients,
      totalAccounts,
    ] = await Promise.all([
      this.prisma.account.aggregate({ _sum: { balance: true }, where: { type: 'CURRENT', status: 'ACTIVE' } }),
      this.prisma.account.aggregate({ _sum: { balance: true }, where: { type: 'SAVINGS', status: 'ACTIVE' } }),
      this.prisma.account.aggregate({ _sum: { balance: true }, where: { type: 'DAT', status: 'ACTIVE' } }),
      this.prisma.credit.aggregate({ _sum: { amount: true }, _count: true, where: { status: { in: ['DISBURSED', 'ACTIVE'] } } }),
      this.prisma.credit.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.credit.count({ where: { status: 'DEFAULTED' } }),
      this.prisma.credit.aggregate({ _sum: { remainingAmount: true }, where: { status: { in: ['DISBURSED', 'ACTIVE'] } } }),
      this.prisma.client.count(),
      this.prisma.client.count({ where: { status: 'ACTIVE' } }),
      this.prisma.account.count({ where: { status: 'ACTIVE' } }),
    ]);

    const depotsCourants = Number(totalDepotsCourants._sum.balance || 0);
    const epargneVal = Number(totalEpargne._sum.balance || 0);
    const datVal = Number(totalDAT._sum.balance || 0);
    const totalDepotsClients = depotsCourants + epargneVal + datVal;
    const encourCredits = Number(totalCreditsRemainingAgg._sum.remainingAmount || 0);
    const creditsActifs = creditsActiveAgg._count || 0;
    const totalCreditDecaisse = Number(creditsActiveAgg._sum.amount || 0);

    // ---- PAR (Portfolio at Risk) ----
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const oneEightyDaysAgo = new Date(); oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);
    const threeSixtyDaysAgo = new Date(); threeSixtyDaysAgo.setDate(threeSixtyDaysAgo.getDate() - 360);

    const [par30, par90, par180, par360] = await Promise.all([
      this.prisma.repayment.aggregate({ _sum: { amount: true }, where: { status: 'PENDING', dueDate: { lt: thirtyDaysAgo } } }),
      this.prisma.repayment.aggregate({ _sum: { amount: true }, where: { status: 'PENDING', dueDate: { lt: ninetyDaysAgo } } }),
      this.prisma.repayment.aggregate({ _sum: { amount: true }, where: { status: 'PENDING', dueDate: { lt: oneEightyDaysAgo } } }),
      this.prisma.repayment.aggregate({ _sum: { amount: true }, where: { status: 'PENDING', dueDate: { lt: threeSixtyDaysAgo } } }),
    ]);

    const par30Val = Number(par30._sum.amount || 0);
    const par90Val = Number(par90._sum.amount || 0);
    const par180Val = Number(par180._sum.amount || 0);
    const par360Val = Number(par360._sum.amount || 0);

    // ---- Tresorerie (comptes comptables classe 1) ----
    const tresoAccounts = await this.prisma.accountPlan.findMany({
      where: { code: { in: ['101', '102', '111'] } },
    });
    let tresorerie = 0;
    for (const acc of tresoAccounts) {
      const agg = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { accountId: acc.id },
      });
      tresorerie += Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0);
    }

    // ---- Fonds propres (Capital + Reserves + Report a nouveau) ----
    const fpAccounts = await this.prisma.accountPlan.findMany({
      where: { code: { in: ['40', '41', '42'] } },
    });
    let fondsPropres = 0;
    for (const acc of fpAccounts) {
      const agg = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { accountId: acc.id },
      });
      fondsPropres += Number(agg._sum.credit || 0) - Number(agg._sum.debit || 0);
    }

    // ---- Produits et charges de l'exercice ----
    const chargeAccounts = await this.prisma.accountPlan.findMany({ where: { type: 'CHARGE', level: { gte: 2 } } });
    const produitAccounts = await this.prisma.accountPlan.findMany({ where: { type: 'PRODUIT', level: { gte: 2 } } });
    let totalCharges = 0;
    let totalProduits = 0;
    const yearWhere = { date: { gte: startOfYear } };
    for (const acc of chargeAccounts) {
      const r = await this.prisma.journalEntry.aggregate({ _sum: { debit: true, credit: true }, where: { ...yearWhere, accountId: acc.id } });
      totalCharges += Number(r._sum.debit || 0) - Number(r._sum.credit || 0);
    }
    for (const acc of produitAccounts) {
      const r = await this.prisma.journalEntry.aggregate({ _sum: { debit: true, credit: true }, where: { ...yearWhere, accountId: acc.id } });
      totalProduits += Number(r._sum.credit || 0) - Number(r._sum.debit || 0);
    }

    // ---- Calcul des ratios COBAC ----
    const totalActifsPonderes = encourCredits + tresorerie;

    const ratios = {
      liquidite: {
        valeur: totalDepotsClients > 0 ? (tresorerie / totalDepotsClients) * 100 : 0,
        norme: 100,
        comparaison: '>=',
        label: 'Ratio de liquidite',
        description: 'Tresorerie / Depots clients',
        conforme: totalDepotsClients > 0 ? (tresorerie / totalDepotsClients) * 100 >= 100 : true,
      },
      solvabilite: {
        valeur: totalActifsPonderes > 0 ? (fondsPropres / totalActifsPonderes) * 100 : 0,
        norme: 10,
        comparaison: '>=',
        label: 'Ratio de solvabilite',
        description: 'Fonds propres / Actifs ponderes',
        conforme: totalActifsPonderes > 0 ? (fondsPropres / totalActifsPonderes) * 100 >= 10 : true,
      },
      couvertureRisques: {
        valeur: encourCredits > 0 ? (fondsPropres / encourCredits) * 100 : 0,
        norme: 8,
        comparaison: '>=',
        label: 'Couverture des risques',
        description: 'Fonds propres / Encours credits',
        conforme: encourCredits > 0 ? (fondsPropres / encourCredits) * 100 >= 8 : true,
      },
      creditsDepots: {
        valeur: totalDepotsClients > 0 ? (encourCredits / totalDepotsClients) * 100 : 0,
        norme: 70,
        comparaison: '<=',
        label: 'Ratio credits / depots',
        description: 'Encours credits / Total depots',
        conforme: totalDepotsClients > 0 ? (encourCredits / totalDepotsClients) * 100 <= 70 : true,
      },
      par30: {
        valeur: encourCredits > 0 ? (par30Val / encourCredits) * 100 : 0,
        norme: 5,
        comparaison: '<=',
        label: 'PAR > 30 jours',
        description: 'Portefeuille a risque / Encours credits',
        conforme: encourCredits > 0 ? (par30Val / encourCredits) * 100 <= 5 : true,
      },
      coefficientExploitation: {
        valeur: totalProduits > 0 ? (totalCharges / totalProduits) * 100 : 0,
        norme: 70,
        comparaison: '<=',
        label: 'Coefficient d\'exploitation',
        description: 'Total charges / Total produits',
        conforme: totalProduits > 0 ? (totalCharges / totalProduits) * 100 <= 70 : true,
      },
    };

    const nbConformes = Object.values(ratios).filter(r => r.conforme).length;
    const nbTotal = Object.values(ratios).length;

    return {
      dateGeneration: now,
      exercice: now.getFullYear(),
      conformiteGlobale: nbConformes === nbTotal,
      scoreConformite: `${nbConformes}/${nbTotal}`,

      situationPatrimoniale: {
        tresorerie,
        totalDepotsClients,
        depotsCourants,
        epargne: epargneVal,
        dat: datVal,
        encourCredits,
        fondsPropres,
        totalActifs: tresorerie + encourCredits,
      },

      qualitePortefeuille: {
        creditsActifs,
        creditsPending: creditsPendingCount,
        creditsDefaulted: creditsDefaultedCount,
        totalCreditDecaisse,
        encourCredits,
        par30: { montant: par30Val, taux: encourCredits > 0 ? (par30Val / encourCredits) * 100 : 0 },
        par90: { montant: par90Val, taux: encourCredits > 0 ? (par90Val / encourCredits) * 100 : 0 },
        par180: { montant: par180Val, taux: encourCredits > 0 ? (par180Val / encourCredits) * 100 : 0 },
        par360: { montant: par360Val, taux: encourCredits > 0 ? (par360Val / encourCredits) * 100 : 0 },
      },

      exploitation: {
        totalProduits,
        totalCharges,
        resultatNet: totalProduits - totalCharges,
      },

      ratiosPrudentiels: ratios,

      indicateursGeneraux: {
        totalClients,
        activeClients,
        totalAccounts,
        tauxActiviteClients: totalClients > 0 ? (activeClients / totalClients) * 100 : 0,
      },
    };
  }

  /**
   * Genere le rapport COBAC complet au format Excel (xlsx)
   * Feuille 1 : Ratios prudentiels
   * Feuille 2 : Situation patrimoniale
   * Feuille 3 : Qualite du portefeuille (PAR)
   */
  async generateCobacExcel(): Promise<Buffer> {
    const XLSX = await import('xlsx');

    const cobacData = await this.getCOBACReport();
    const wb = XLSX.utils.book_new();

    // ---- Feuille 1 : Ratios prudentiels ----
    const ratiosSheet: any[][] = [
      ['RAPPORT COBAC - RATIOS PRUDENTIELS'],
      ['Date de generation', new Date().toLocaleDateString('fr-FR')],
      ['Exercice', cobacData.exercice],
      ['Score de conformite', cobacData.scoreConformite],
      [''],
      ['Ratio', 'Valeur (%)', 'Norme COBAC (%)', 'Comparaison', 'Description', 'Conformite'],
    ];

    for (const ratio of Object.values(cobacData.ratiosPrudentiels) as any[]) {
      ratiosSheet.push([
        ratio.label,
        Number(ratio.valeur.toFixed(2)),
        ratio.norme,
        ratio.comparaison,
        ratio.description,
        ratio.conforme ? 'CONFORME' : 'NON CONFORME',
      ]);
    }

    const ws1 = XLSX.utils.aoa_to_sheet(ratiosSheet);
    ws1['!cols'] = [{ wch: 35 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Ratios Prudentiels');

    // ---- Feuille 2 : Situation patrimoniale ----
    const sp = cobacData.situationPatrimoniale;
    const exp = cobacData.exploitation;
    const patrimoineSheet: any[][] = [
      ['SITUATION PATRIMONIALE'],
      ['Date de generation', new Date().toLocaleDateString('fr-FR')],
      [''],
      ['ACTIF', 'Montant (FCFA)'],
      ['Tresorerie (Caisse + Banque)', sp.tresorerie],
      ['Encours de credits', sp.encourCredits],
      ['Total Actifs', sp.totalActifs],
      [''],
      ['PASSIF / RESSOURCES', 'Montant (FCFA)'],
      ['Depots courants', sp.depotsCourants],
      ['Epargne', sp.epargne],
      ['DAT (Depots a Terme)', sp.dat],
      ['Total Depots Clients', sp.totalDepotsClients],
      ['Fonds Propres', sp.fondsPropres],
      [''],
      ['EXPLOITATION (exercice en cours)', 'Montant (FCFA)'],
      ['Total Produits', exp.totalProduits],
      ['Total Charges', exp.totalCharges],
      ['Resultat Net', exp.resultatNet],
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(patrimoineSheet);
    ws2['!cols'] = [{ wch: 38 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Situation Patrimoniale');

    // ---- Feuille 3 : Qualite du portefeuille (PAR) ----
    const qp = cobacData.qualitePortefeuille;
    const ind = cobacData.indicateursGeneraux;
    const parSheet: any[][] = [
      ['QUALITE DU PORTEFEUILLE (PAR - Portfolio at Risk)'],
      ['Date de generation', new Date().toLocaleDateString('fr-FR')],
      [''],
      ['PORTEFEUILLE CREDITS', ''],
      ['Credits actifs', qp.creditsActifs],
      ['Credits en attente', qp.creditsPending],
      ['Credits en defaut', qp.creditsDefaulted],
      ['Total credit decaisse', qp.totalCreditDecaisse],
      ['Encours credits', qp.encourCredits],
      [''],
      ['PORTEFEUILLE A RISQUE', 'Montant (FCFA)', 'Taux (%)'],
      ['PAR > 30 jours (norme COBAC <= 5%)', qp.par30.montant, Number(qp.par30.taux.toFixed(2))],
      ['PAR > 90 jours', qp.par90.montant, Number(qp.par90.taux.toFixed(2))],
      ['PAR > 180 jours', qp.par180.montant, Number(qp.par180.taux.toFixed(2))],
      ['PAR > 360 jours', qp.par360.montant, Number(qp.par360.taux.toFixed(2))],
      [''],
      ['INDICATEURS GENERAUX', ''],
      ['Total clients', ind.totalClients],
      ['Clients actifs', ind.activeClients],
      ["Taux d'activite clients (%)", Number(ind.tauxActiviteClients.toFixed(2))],
      ['Total comptes actifs', ind.totalAccounts],
    ];

    const ws3 = XLSX.utils.aoa_to_sheet(parSheet);
    ws3['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Qualite Portefeuille');

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
}
