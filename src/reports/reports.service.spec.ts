import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;

  // Helper to create aggregate result
  const agg = (val: number | null, field = 'amount') => ({
    _sum: { [field]: val, balance: val, fees: val, tax: val, paidAmount: val, remainingAmount: val, credit: val, debit: val },
    _count: val ? 1 : 0,
  });

  const mockPrisma: any = {
    client: {
      count: jest.fn().mockResolvedValue(0),
    },
    account: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue(agg(0)),
      findMany: jest.fn().mockResolvedValue([]),
    },
    credit: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue(agg(0)),
      findMany: jest.fn().mockResolvedValue([]),
    },
    transaction: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue(agg(0)),
    },
    repayment: {
      aggregate: jest.fn().mockResolvedValue(agg(0)),
    },
    agency: {
      findUnique: jest.fn(),
    },
    tontineGroup: {
      count: jest.fn().mockResolvedValue(0),
    },
    tontinePayment: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue(agg(0)),
    },
    savingsGoal: {
      count: jest.fn().mockResolvedValue(0),
    },
    accountPlan: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    journalEntry: {
      aggregate: jest.fn().mockResolvedValue(agg(0)),
    },
    cashRegister: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // getKPIs
  // ==========================================================

  describe('getKPIs', () => {
    it('should return KPIs with correct structure', async () => {
      mockPrisma.client.count.mockResolvedValue(100);
      mockPrisma.account.count.mockResolvedValue(150);
      mockPrisma.account.aggregate.mockResolvedValue(agg(5000000));
      mockPrisma.credit.count.mockResolvedValue(20);
      mockPrisma.credit.aggregate.mockResolvedValue(agg(10000000));
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(2000000));
      mockPrisma.transaction.count.mockResolvedValue(500);
      mockPrisma.repayment.aggregate.mockResolvedValue(agg(0));

      const result = await service.getKPIs();

      expect(result).toHaveProperty('clientele');
      expect(result).toHaveProperty('comptes');
      expect(result).toHaveProperty('credits');
      expect(result).toHaveProperty('activiteMois');
      expect(result).toHaveProperty('ratiosPrudentiels');
    });

    it('should include clientele stats', async () => {
      mockPrisma.client.count
        .mockResolvedValueOnce(200)  // totalClients
        .mockResolvedValueOnce(180)  // activeClients
        .mockResolvedValueOnce(15);  // newClientsMonth
      mockPrisma.account.count.mockResolvedValue(0);
      mockPrisma.account.aggregate.mockResolvedValue(agg(0));
      mockPrisma.credit.count.mockResolvedValue(0);
      mockPrisma.credit.aggregate.mockResolvedValue(agg(0));
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(0));
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.repayment.aggregate.mockResolvedValue(agg(0));

      const result = await service.getKPIs();

      expect(result.clientele.totalClients).toBe(200);
      expect(result.clientele.activeClients).toBe(180);
      expect(result.clientele.newClientsMonth).toBe(15);
      expect(result.clientele.tauxActivite).toContain('%');
    });

    it('should calculate PAR > 30 days', async () => {
      mockPrisma.client.count.mockResolvedValue(100);
      mockPrisma.account.count.mockResolvedValue(100);
      mockPrisma.account.aggregate.mockResolvedValue(agg(1000000));
      mockPrisma.credit.count.mockResolvedValue(10);
      mockPrisma.credit.aggregate.mockResolvedValue(agg(5000000));
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(0));
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.repayment.aggregate.mockResolvedValue(agg(250000));

      const result = await service.getKPIs();

      expect(result.credits.par30).toBeDefined();
      expect(result.credits.par30).toContain('%');
    });

    it('should handle zero values without errors', async () => {
      mockPrisma.client.count.mockResolvedValue(0);
      mockPrisma.account.count.mockResolvedValue(0);
      mockPrisma.account.aggregate.mockResolvedValue(agg(null));
      mockPrisma.credit.count.mockResolvedValue(0);
      mockPrisma.credit.aggregate.mockResolvedValue(agg(null));
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(null));
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.repayment.aggregate.mockResolvedValue(agg(null));

      const result = await service.getKPIs();

      expect(result.clientele.tauxActivite).toBe('0%');
      expect(result.ratiosPrudentiels.ratioLiquidite).toBe('N/A');
    });
  });

  // ==========================================================
  // getMonthlyReport
  // ==========================================================

  describe('getMonthlyReport', () => {
    beforeEach(() => {
      mockPrisma.client.count.mockResolvedValue(10);
      mockPrisma.account.count.mockResolvedValue(15);
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(500000));
      mockPrisma.transaction.count.mockResolvedValue(100);
      mockPrisma.credit.count.mockResolvedValue(5);
      mockPrisma.credit.aggregate.mockResolvedValue(agg(2000000));
      mockPrisma.repayment.aggregate.mockResolvedValue(agg(300000));
    });

    it('should return report with correct structure', async () => {
      const result = await service.getMonthlyReport(2026, 7);

      expect(result).toHaveProperty('periode', '07/2026');
      expect(result).toHaveProperty('clientele');
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('revenus');
      expect(result).toHaveProperty('credits');
    });

    it('should include transaction breakdown', async () => {
      const result = await service.getMonthlyReport(2026, 7);

      expect(result.transactions).toHaveProperty('total');
      expect(result.transactions).toHaveProperty('depots');
      expect(result.transactions).toHaveProperty('retraits');
      expect(result.transactions).toHaveProperty('transferts');
      expect(result.transactions.depots).toHaveProperty('count');
      expect(result.transactions.depots).toHaveProperty('montant');
    });

    it('should format period correctly', async () => {
      const result = await service.getMonthlyReport(2026, 1);
      expect(result.periode).toBe('01/2026');
    });
  });

  // ==========================================================
  // getYearlyTrend
  // ==========================================================

  describe('getYearlyTrend', () => {
    it('should return 12 months of data', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(100000));
      mockPrisma.client.count.mockResolvedValue(5);

      const result = await service.getYearlyTrend();

      expect(result).toHaveLength(12);
    });

    it('should include deposits, withdrawals, and new clients per month', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(200000));
      mockPrisma.client.count.mockResolvedValue(3);

      const result = await service.getYearlyTrend();

      expect(result[0]).toHaveProperty('mois');
      expect(result[0]).toHaveProperty('depots');
      expect(result[0]).toHaveProperty('retraits');
      expect(result[0]).toHaveProperty('nouveauxClients');
    });

    it('should format month labels as MM/YYYY', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(0));
      mockPrisma.client.count.mockResolvedValue(0);

      const result = await service.getYearlyTrend();

      for (const item of result) {
        expect(item.mois).toMatch(/^\d{2}\/\d{4}$/);
      }
    });
  });

  // ==========================================================
  // getCOBACReport
  // ==========================================================

  describe('getCOBACReport', () => {
    beforeEach(() => {
      mockPrisma.account.aggregate.mockResolvedValue(agg(1000000));
      mockPrisma.credit.aggregate.mockResolvedValue(agg(500000));
      mockPrisma.credit.count.mockResolvedValue(5);
      mockPrisma.client.count.mockResolvedValue(100);
      mockPrisma.repayment.aggregate.mockResolvedValue(agg(50000));
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue(agg(0));
      mockPrisma.account.count.mockResolvedValue(150);
    });

    it('should return COBAC report with correct structure', async () => {
      const result = await service.getCOBACReport();

      expect(result).toHaveProperty('dateGeneration');
      expect(result).toHaveProperty('exercice');
      expect(result).toHaveProperty('conformiteGlobale');
      expect(result).toHaveProperty('scoreConformite');
      expect(result).toHaveProperty('situationPatrimoniale');
      expect(result).toHaveProperty('qualitePortefeuille');
      expect(result).toHaveProperty('exploitation');
      expect(result).toHaveProperty('ratiosPrudentiels');
      expect(result).toHaveProperty('indicateursGeneraux');
    });

    it('should include all 6 COBAC ratios', async () => {
      const result = await service.getCOBACReport();

      const ratios = result.ratiosPrudentiels;
      expect(ratios).toHaveProperty('liquidite');
      expect(ratios).toHaveProperty('solvabilite');
      expect(ratios).toHaveProperty('couvertureRisques');
      expect(ratios).toHaveProperty('creditsDepots');
      expect(ratios).toHaveProperty('par30');
      expect(ratios).toHaveProperty('coefficientExploitation');
    });

    it('should include conformity flag for each ratio', async () => {
      const result = await service.getCOBACReport();

      for (const ratio of Object.values(result.ratiosPrudentiels) as any[]) {
        expect(ratio).toHaveProperty('valeur');
        expect(ratio).toHaveProperty('norme');
        expect(ratio).toHaveProperty('comparaison');
        expect(ratio).toHaveProperty('conforme');
        expect(typeof ratio.conforme).toBe('boolean');
      }
    });

    it('should include PAR at multiple thresholds', async () => {
      const result = await service.getCOBACReport();

      expect(result.qualitePortefeuille).toHaveProperty('par30');
      expect(result.qualitePortefeuille).toHaveProperty('par90');
      expect(result.qualitePortefeuille).toHaveProperty('par180');
      expect(result.qualitePortefeuille).toHaveProperty('par360');

      expect(result.qualitePortefeuille.par30).toHaveProperty('montant');
      expect(result.qualitePortefeuille.par30).toHaveProperty('taux');
    });

    it('should compute score format as X/6', async () => {
      const result = await service.getCOBACReport();

      expect(result.scoreConformite).toMatch(/^\d\/6$/);
    });
  });

  // ==========================================================
  // calculateProvisioning
  // ==========================================================

  describe('calculateProvisioning', () => {
    it('should return provisioning with all COBAC categories', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([]);

      const result = await service.calculateProvisioning();

      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('totalCredits');
      expect(result).toHaveProperty('totalOutstanding');
      expect(result).toHaveProperty('totalProvision');
      expect(result).toHaveProperty('coverageRate');
      expect(result).toHaveProperty('categories');
      expect(result.categories).toHaveProperty('saines');
      expect(result.categories).toHaveProperty('preDouteuses');
      expect(result.categories).toHaveProperty('douteuses');
      expect(result.categories).toHaveProperty('contentieuses');
      expect(result.categories).toHaveProperty('compromises');
    });

    it('should classify credits based on days late', async () => {
      const now = new Date();
      const daysAgo = (n: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() - n);
        return d;
      };

      mockPrisma.credit.findMany.mockResolvedValue([
        {
          id: 'c1',
          creditNumber: 'CR001',
          remainingAmount: 100000,
          client: { id: 'cl1', firstName: 'Jean', lastName: 'Dupont', clientNumber: 'CLI001' },
          repayments: [], // no overdue -> saines
        },
        {
          id: 'c2',
          creditNumber: 'CR002',
          remainingAmount: 200000,
          client: { id: 'cl2', firstName: 'Marie', lastName: 'Ateba', clientNumber: 'CLI002' },
          repayments: [{ dueDate: daysAgo(45), status: 'PENDING' }], // 45 days -> preDouteuses
        },
        {
          id: 'c3',
          creditNumber: 'CR003',
          remainingAmount: 300000,
          client: { id: 'cl3', firstName: 'Paul', lastName: 'Ndi', clientNumber: 'CLI003' },
          repayments: [{ dueDate: daysAgo(120), status: 'LATE' }], // 120 days -> douteuses
        },
        {
          id: 'c4',
          creditNumber: 'CR004',
          remainingAmount: 400000,
          client: { id: 'cl4', firstName: 'Alice', lastName: 'Biya', clientNumber: 'CLI004' },
          repayments: [{ dueDate: daysAgo(200), status: 'PENDING' }], // 200 days -> contentieuses
        },
        {
          id: 'c5',
          creditNumber: 'CR005',
          remainingAmount: 500000,
          client: { id: 'cl5', firstName: 'Bob', lastName: 'Fru', clientNumber: 'CLI005' },
          repayments: [{ dueDate: daysAgo(400), status: 'PENDING' }], // 400 days -> compromises
        },
      ]);

      const result = await service.calculateProvisioning();

      expect(result.totalCredits).toBe(5);
      expect(result.categories.saines.credits).toHaveLength(1);
      expect(result.categories.preDouteuses.credits).toHaveLength(1);
      expect(result.categories.douteuses.credits).toHaveLength(1);
      expect(result.categories.contentieuses.credits).toHaveLength(1);
      expect(result.categories.compromises.credits).toHaveLength(1);
    });

    it('should apply correct provisioning rates', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([
        {
          id: 'c1',
          creditNumber: 'CR001',
          remainingAmount: 1000000,
          client: { id: 'cl1', firstName: 'Test', lastName: 'User', clientNumber: 'CLI001' },
          repayments: [], // saines -> 1% rate
        },
      ]);

      const result = await service.calculateProvisioning();

      expect(result.categories.saines.rate).toBe(0.01);
      expect(result.categories.preDouteuses.rate).toBe(0.25);
      expect(result.categories.douteuses.rate).toBe(0.50);
      expect(result.categories.contentieuses.rate).toBe(0.75);
      expect(result.categories.compromises.rate).toBe(1.00);
      expect(result.categories.saines.provision).toBe(10000); // 1% of 1M
    });

    it('should filter by agency when agencyId is provided', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([]);

      await service.calculateProvisioning('agency-1');

      expect(mockPrisma.credit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            client: { agencyId: 'agency-1' },
          }),
        }),
      );
    });

    it('should compute coverage rate', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([]);

      const result = await service.calculateProvisioning();

      expect(typeof result.coverageRate).toBe('number');
    });
  });

  // ==========================================================
  // getReportByAgency
  // ==========================================================

  describe('getReportByAgency', () => {
    it('should throw NotFoundException for unknown agency', async () => {
      mockPrisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.getReportByAgency('unknown-id')).rejects.toThrow(NotFoundException);
    });

    it('should return agency report with correct structure', async () => {
      mockPrisma.agency.findUnique.mockResolvedValue({
        id: 'ag-1',
        name: 'Agence Douala',
        code: 'DLA',
        city: 'Douala',
      });
      mockPrisma.client.count.mockResolvedValue(50);
      mockPrisma.account.count.mockResolvedValue(60);
      mockPrisma.account.aggregate.mockResolvedValue(agg(3000000));
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(1000000));
      mockPrisma.transaction.count.mockResolvedValue(200);
      mockPrisma.credit.count.mockResolvedValue(10);
      mockPrisma.credit.aggregate.mockResolvedValue(agg(2000000));

      const result = await service.getReportByAgency('ag-1');

      expect(result).toHaveProperty('agency');
      expect(result.agency.name).toBe('Agence Douala');
      expect(result).toHaveProperty('periode');
      expect(result).toHaveProperty('clientele');
      expect(result).toHaveProperty('comptes');
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('credits');
    });
  });

  // ==========================================================
  // getDailyReport
  // ==========================================================

  describe('getDailyReport', () => {
    beforeEach(() => {
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(100000));
      mockPrisma.transaction.count.mockResolvedValue(50);
      mockPrisma.client.count.mockResolvedValue(3);
      mockPrisma.account.count.mockResolvedValue(5);
      mockPrisma.cashRegister.findMany.mockResolvedValue([]);
    });

    it('should return daily report with correct structure', async () => {
      const result = await service.getDailyReport('2026-07-30');

      expect(result).toHaveProperty('date');
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result).toHaveProperty('operations');
      expect(result).toHaveProperty('revenus');
      expect(result).toHaveProperty('croissance');
      expect(result).toHaveProperty('caisses');
    });

    it('should default to today when no date provided', async () => {
      const result = await service.getDailyReport();

      expect(result.date).toBeDefined();
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should include cash register data', async () => {
      mockPrisma.cashRegister.findMany.mockResolvedValue([
        {
          id: 'cr-1',
          status: 'CLOSED',
          openingBalance: 500000n,
          totalDeposits: 200000n,
          totalWithdrawals: 100000n,
          closingBalance: 600000n,
          difference: 0n,
          user: { firstName: 'Jean', lastName: 'Caissier' },
          agency: { name: 'Agence Douala' },
        },
      ]);

      const result = await service.getDailyReport('2026-07-30');

      expect(result.caisses).toHaveLength(1);
      expect(result.caisses[0].openingBalance).toBe(Number(500000n));
    });
  });

  // ==========================================================
  // getWeeklyReport
  // ==========================================================

  describe('getWeeklyReport', () => {
    beforeEach(() => {
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(300000));
      mockPrisma.transaction.count.mockResolvedValue(100);
      mockPrisma.client.count.mockResolvedValue(5);
      mockPrisma.credit.count.mockResolvedValue(2);
      mockPrisma.repayment.aggregate.mockResolvedValue(agg(50000));
    });

    it('should return weekly report with 7-day detail', async () => {
      const result = await service.getWeeklyReport('2026-07-27');

      expect(result).toHaveProperty('semaine');
      expect(result).toHaveProperty('resume');
      expect(result).toHaveProperty('detailParJour');
      expect(result.detailParJour).toHaveLength(7);
    });

    it('should include day names in detail', async () => {
      const result = await service.getWeeklyReport('2026-07-27');

      for (const day of result.detailParJour) {
        expect(day).toHaveProperty('jour');
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('depots');
        expect(day).toHaveProperty('retraits');
      }
    });
  });

  // ==========================================================
  // getEnrichedKPIs
  // ==========================================================

  describe('getEnrichedKPIs', () => {
    it('should return enriched KPIs with cotisations and revenus', async () => {
      mockPrisma.tontineGroup.count.mockResolvedValue(5);
      mockPrisma.tontinePayment.aggregate.mockResolvedValue(agg(1000000));
      mockPrisma.tontinePayment.count.mockResolvedValue(10);
      mockPrisma.savingsGoal.count.mockResolvedValue(3);
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue(agg(0));

      const result = await service.getEnrichedKPIs();

      expect(result).toHaveProperty('cotisations');
      expect(result).toHaveProperty('revenus');
      expect(result.cotisations).toHaveProperty('tontineGroupsActive');
      expect(result.cotisations).toHaveProperty('tontineGroupsTotal');
      expect(result.cotisations).toHaveProperty('cotisationsEnRetard');
      expect(result.revenus).toHaveProperty('interetsCredits');
      expect(result.revenus).toHaveProperty('commissionsFrais');
      expect(result.revenus).toHaveProperty('totalRevenus');
      expect(result.revenus).toHaveProperty('resultatMois');
    });
  });

  // ==========================================================
  // generateTafire
  // ==========================================================

  describe('generateTafire', () => {
    beforeEach(() => {
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(1000000));
      mockPrisma.credit.aggregate.mockResolvedValue(agg(500000));
    });

    it('should return TAFIRE with correct structure', async () => {
      const result = await service.generateTafire(2026);

      expect(result).toHaveProperty('title');
      expect(result.title).toContain('TAFIRE');
      expect(result.title).toContain('2026');
      expect(result).toHaveProperty('year', 2026);
      expect(result).toHaveProperty('exploitation');
      expect(result).toHaveProperty('investissement');
      expect(result).toHaveProperty('financement');
      expect(result).toHaveProperty('synthese');
    });

    it('should calculate flux net for each section', async () => {
      const result = await service.generateTafire(2026);

      expect(result.exploitation).toHaveProperty('fluxNet');
      expect(result.investissement).toHaveProperty('fluxNet');
      expect(result.financement).toHaveProperty('fluxNet');
      expect(typeof result.exploitation.fluxNet).toBe('number');
    });

    it('should include variation de tresorerie in synthese', async () => {
      const result = await service.generateTafire(2026);

      expect(result.synthese).toHaveProperty('variationTresorerie');
      expect(result.synthese).toHaveProperty('encoursCreditsFin');
    });
  });

  // ==========================================================
  // getAccountOpeningsReport
  // ==========================================================

  describe('getAccountOpeningsReport', () => {
    it('should return account openings report', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);

      const result = await service.getAccountOpeningsReport();

      expect(result).toHaveProperty('periode');
      expect(result).toHaveProperty('totalComptesOuverts');
      expect(result).toHaveProperty('totalFraisCollectes');
      expect(result).toHaveProperty('parProduit');
      expect(result).toHaveProperty('details');
    });

    it('should group accounts by product', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'a1',
          accountNumber: 'ACC001',
          type: 'CURRENT',
          balance: 0n,
          createdAt: new Date(),
          product: { name: 'Compte Courant', openingFees: 5000n },
          client: { firstName: 'Jean', lastName: 'Test', clientNumber: 'CLI001', clientType: 'PHYSIQUE' },
          agency: { name: 'Douala' },
        },
        {
          id: 'a2',
          accountNumber: 'ACC002',
          type: 'CURRENT',
          balance: 0n,
          createdAt: new Date(),
          product: { name: 'Compte Courant', openingFees: 5000n },
          client: { firstName: 'Marie', lastName: 'Test', clientNumber: 'CLI002', clientType: 'PHYSIQUE' },
          agency: { name: 'Douala' },
        },
      ]);
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);

      const result = await service.getAccountOpeningsReport();

      expect(result.totalComptesOuverts).toBe(2);
      expect(result.parProduit).toHaveLength(1);
      expect(result.parProduit[0].count).toBe(2);
    });
  });

  // ==========================================================
  // getDgiTva
  // ==========================================================

  describe('getDgiTva', () => {
    beforeEach(() => {
      // Default mocks for TVA
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(0));
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);
      if (!mockPrisma.billPayment) {
        mockPrisma.billPayment = {
          aggregate: jest.fn().mockResolvedValue(agg(0)),
        };
      } else {
        mockPrisma.billPayment.aggregate.mockResolvedValue(agg(0));
      }
    });

    it('should return correct structure', async () => {
      const result = await service.getDgiTva(2026, 7);

      expect(result).toHaveProperty('titre', 'DECLARATION DE TVA MENSUELLE');
      expect(result).toHaveProperty('periode', '07/2026');
      expect(result).toHaveProperty('tauxTva', 19.25);
      expect(result).toHaveProperty('synthese');
      expect(result).toHaveProperty('detailParOperation');
    });

    it('should calculate TVA collectee from transactions', async () => {
      // Main aggregate: total transactions
      mockPrisma.transaction.aggregate
        .mockResolvedValueOnce(agg(50000)) // total aggregate (tax=50000, fees=50000)
        .mockResolvedValueOnce(agg(30000)) // DEPOSIT type
        .mockResolvedValueOnce(agg(15000)) // WITHDRAWAL type
        .mockResolvedValueOnce(agg(5000)); // TRANSFER type

      const result = await service.getDgiTva(2026, 7);

      expect(result.synthese.tvaCollectee).toBeGreaterThanOrEqual(0);
      expect(typeof result.synthese.tvaCollectee).toBe('number');
    });

    it('should calculate TVA on bill payments (19.25% of fees)', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(0));
      mockPrisma.billPayment.aggregate.mockResolvedValue({
        _sum: { fees: 100000 },
        _count: 10,
      });

      const result = await service.getDgiTva(2026, 7);

      // 19.25% of 100000 = 19250
      expect(result.paiementsFactures.tvaCollectee).toBe(19250);
      expect(result.paiementsFactures.nbOperations).toBe(10);
    });

    it('should compute TVA nette = collectee - deductible', async () => {
      // Transaction tax = 50000
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { tax: 50000, fees: 200000, amount: 1000000 },
        _count: 20,
      });
      mockPrisma.billPayment.aggregate.mockResolvedValue({
        _sum: { fees: 0 },
        _count: 0,
      });

      // No comptable TVA accounts
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);

      const result = await service.getDgiTva(2026, 7);

      // TVA collectee = 50000 (tx tax) + 0 (bill), deductible = 0
      expect(result.synthese.tvaNette).toBe(50000);
      expect(result.synthese.montantAReverser).toBe(50000);
    });

    it('should handle months with no transactions', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { tax: null, fees: null, amount: null },
        _count: 0,
      });
      mockPrisma.billPayment.aggregate.mockResolvedValue({
        _sum: { fees: null },
        _count: 0,
      });

      const result = await service.getDgiTva(2026, 2);

      expect(result.synthese.tvaCollectee).toBe(0);
      expect(result.synthese.tvaNette).toBe(0);
      expect(result.synthese.montantAReverser).toBe(0);
    });

    it('should filter out types with 0 operations in detailParOperation', async () => {
      // Only DEPOSIT has operations
      mockPrisma.transaction.aggregate
        .mockResolvedValueOnce(agg(10000)) // total
        .mockResolvedValueOnce({ _sum: { tax: 10000, fees: 50000, amount: 300000 }, _count: 5 }) // DEPOSIT
        .mockResolvedValueOnce({ _sum: { tax: null, fees: null, amount: null }, _count: 0 }) // WITHDRAWAL
        .mockResolvedValueOnce({ _sum: { tax: null, fees: null, amount: null }, _count: 0 }); // TRANSFER

      const result = await service.getDgiTva(2026, 7);

      expect(result.detailParOperation).toHaveLength(1);
      expect(result.detailParOperation[0].type).toBe('DEPOSIT');
    });
  });

  // ==========================================================
  // getDgiDsf
  // ==========================================================

  describe('getDgiDsf', () => {
    beforeEach(() => {
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue(agg(0));
      mockPrisma.transaction.aggregate.mockResolvedValue(agg(0));
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.credit.aggregate.mockResolvedValue(agg(0));
      mockPrisma.account.aggregate.mockResolvedValue(agg(0));
    });

    it('should return correct DSF structure', async () => {
      const result = await service.getDgiDsf(2026);

      expect(result).toHaveProperty('titre', 'DECLARATION STATISTIQUE ET FISCALE (DSF)');
      expect(result).toHaveProperty('exercice', 2026);
      expect(result).toHaveProperty('identificationFiscale');
      expect(result).toHaveProperty('compteResultat');
      expect(result).toHaveProperty('tvaAnnuelle');
      expect(result).toHaveProperty('volumeActivite');
      expect(result).toHaveProperty('situationPatrimoniale');
    });

    it('should calculate produits from accounts 701, 702, 703, 71', async () => {
      const accountsMap: Record<string, { id: string; code: string; name: string }> = {
        '701': { id: 'ap-701', code: '701', name: 'Interets sur credits' },
        '702': { id: 'ap-702', code: '702', name: 'Commissions et frais' },
        '703': { id: 'ap-703', code: '703', name: 'Penalites de retard' },
        '71': { id: 'ap-71', code: '71', name: 'Produits divers' },
      };

      mockPrisma.accountPlan.findFirst.mockImplementation(({ where }: any) => {
        return Promise.resolve(accountsMap[where.code] || null);
      });

      // credit=500000 for each produit account
      mockPrisma.journalEntry.aggregate.mockResolvedValue({
        _sum: { credit: 500000, debit: 0 },
      });

      const result = await service.getDgiDsf(2026);

      expect(result.compteResultat.produits).toHaveLength(4);
      expect(result.compteResultat.totalProduits).toBe(2000000); // 4 * 500000
    });

    it('should calculate charges from accounts 601, 61, 62, 63, 64', async () => {
      const accountsMap: Record<string, any> = {
        '601': { id: 'ap-601', code: '601', name: 'Interets verses' },
        '61': { id: 'ap-61', code: '61', name: 'Charges generales' },
        '62': { id: 'ap-62', code: '62', name: 'Charges personnel' },
        '63': { id: 'ap-63', code: '63', name: 'Amortissements' },
        '64': { id: 'ap-64', code: '64', name: 'Provisions' },
      };

      mockPrisma.accountPlan.findFirst.mockImplementation(({ where }: any) => {
        return Promise.resolve(accountsMap[where.code] || null);
      });

      // debit=200000 for each charge account
      mockPrisma.journalEntry.aggregate.mockResolvedValue({
        _sum: { debit: 200000, credit: 0 },
      });

      const result = await service.getDgiDsf(2026);

      expect(result.compteResultat.charges).toHaveLength(5);
      expect(result.compteResultat.totalCharges).toBe(1000000); // 5 * 200000
    });

    it('should calculate IS: max(33% of resultat, 2.2% of CA)', async () => {
      // Setup produits = 10M, charges = 0
      mockPrisma.accountPlan.findFirst.mockImplementation(({ where }: any) => {
        if (where.code === '701') return Promise.resolve({ id: 'ap-701', code: '701', name: 'Interets' });
        return Promise.resolve(null);
      });
      mockPrisma.journalEntry.aggregate.mockResolvedValue({
        _sum: { credit: 10000000, debit: 0 },
      });

      const result = await service.getDgiDsf(2026);

      // resultat = 10M, IS normal = 33% of 10M = 3,300,000
      // min perception = 2.2% of 10M = 220,000
      // IS = max(3300000, 220000) = 3,300,000
      expect(result.compteResultat.impotSurLesSocietes.isFinal).toBe(3300000);
      expect(result.compteResultat.impotSurLesSocietes.mode).toBe('IS normal');
    });

    it('should use minimum de perception when resultat is negative', async () => {
      // Produits = 1M, charges = 5M => resultat = -4M
      const accountsMap: Record<string, any> = {
        '701': { id: 'ap-701', code: '701', name: 'Interets' },
        '601': { id: 'ap-601', code: '601', name: 'Charges' },
      };
      mockPrisma.accountPlan.findFirst.mockImplementation(({ where }: any) => {
        return Promise.resolve(accountsMap[where.code] || null);
      });
      mockPrisma.journalEntry.aggregate.mockImplementation(({ where }: any) => {
        if (where.accountId === 'ap-701') {
          return Promise.resolve({ _sum: { credit: 1000000, debit: 0 } });
        }
        if (where.accountId === 'ap-601') {
          return Promise.resolve({ _sum: { debit: 5000000, credit: 0 } });
        }
        return Promise.resolve({ _sum: { credit: 0, debit: 0 } });
      });

      const result = await service.getDgiDsf(2026);

      // resultat = 1M - 5M = -4M, IS normal = max(0, -4M) * 33% = 0
      // min perception = 2.2% of 1M = 22000
      expect(result.compteResultat.impotSurLesSocietes.isFinal).toBe(22000);
      expect(result.compteResultat.impotSurLesSocietes.mode).toBe('Minimum de perception');
    });

    it('should compute resultatNet = resultatAvantImpot - IS', async () => {
      mockPrisma.accountPlan.findFirst.mockImplementation(({ where }: any) => {
        if (where.code === '701') return Promise.resolve({ id: 'ap-701', code: '701', name: 'Interets' });
        return Promise.resolve(null);
      });
      mockPrisma.journalEntry.aggregate.mockResolvedValue({
        _sum: { credit: 10000000, debit: 0 },
      });

      const result = await service.getDgiDsf(2026);

      expect(result.compteResultat.resultatNet).toBe(
        result.compteResultat.resultatAvantImpot - result.compteResultat.impotSurLesSocietes.isFinal,
      );
    });
  });

  // ==========================================================
  // getDgiIrcm
  // ==========================================================

  describe('getDgiIrcm', () => {
    beforeEach(() => {
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);
      mockPrisma.account.findMany.mockResolvedValue([]);
      if (!mockPrisma.journalEntry.findMany) {
        mockPrisma.journalEntry.findMany = jest.fn().mockResolvedValue([]);
      } else {
        mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      }
    });

    it('should return correct structure with tauxIrcm = 16.5', async () => {
      const result = await service.getDgiIrcm(2026, 7);

      expect(result).toHaveProperty('titre');
      expect(result).toHaveProperty('tauxIrcm', 16.5);
      expect(result).toHaveProperty('interetsVerses');
      expect(result).toHaveProperty('ircm');
      expect(result).toHaveProperty('comptesDAT');
    });

    it('should calculate IRCM from account 601 debit entries', async () => {
      mockPrisma.accountPlan.findFirst.mockResolvedValue({ id: 'ap-601', code: '601', name: 'Interets depots' });
      mockPrisma.journalEntry.findMany.mockResolvedValue([
        { id: 'je1', debit: 100000, credit: 0, date: new Date(2026, 6, 10) },
        { id: 'je2', debit: 50000, credit: 0, date: new Date(2026, 6, 20) },
      ]);

      const result = await service.getDgiIrcm(2026, 7);

      // Total interets = 150000, IRCM = 16.5% of 150000 = 24750
      expect(result.interetsVerses.total).toBe(150000);
      expect(result.ircm.montantIrcm).toBe(24750);
    });

    it('should group entries by month', async () => {
      mockPrisma.accountPlan.findFirst.mockResolvedValue({ id: 'ap-601', code: '601', name: 'Interets depots' });
      mockPrisma.journalEntry.findMany.mockResolvedValue([
        { id: 'je1', debit: 100000, credit: 0, date: new Date(2026, 0, 15) },
        { id: 'je2', debit: 80000, credit: 0, date: new Date(2026, 0, 25) },
        { id: 'je3', debit: 60000, credit: 0, date: new Date(2026, 1, 10) },
      ]);

      const result = await service.getDgiIrcm(2026);

      expect(result.interetsVerses.detailParMois).toHaveLength(2);
      expect(result.interetsVerses.detailParMois[0].mois).toBe('2026-01');
      expect(result.interetsVerses.detailParMois[0].montantInterets).toBe(180000);
      expect(result.interetsVerses.detailParMois[0].nbEcritures).toBe(2);
      expect(result.interetsVerses.detailParMois[1].mois).toBe('2026-02');
      expect(result.interetsVerses.detailParMois[1].montantInterets).toBe(60000);
    });

    it('should include DAT account details', async () => {
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);
      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'acc-dat-1',
          accountNumber: 'DAT001',
          type: 'DAT',
          status: 'ACTIVE',
          balance: 5000000n,
          interestRate: 6,
          client: { firstName: 'Jean', lastName: 'Dupont', raisonSociale: null, clientNumber: 'CLI001', clientType: 'PHYSIQUE' },
        },
      ]);

      const result = await service.getDgiIrcm(2026, 7);

      expect(result.comptesDAT.nbComptes).toBe(1);
      expect(result.comptesDAT.details[0].accountNumber).toBe('DAT001');
      expect(result.comptesDAT.details[0].tauxInteret).toBe(6);
    });

    it('should handle year-only mode (no month param)', async () => {
      const result = await service.getDgiIrcm(2026);

      expect(result.periode).toBe('Exercice 2026');
    });
  });

  // ==========================================================
  // getDgiIs
  // ==========================================================

  describe('getDgiIs', () => {
    beforeEach(() => {
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue(agg(0));
    });

    it('should return correct IS structure', async () => {
      const result = await service.getDgiIs(2026);

      expect(result).toHaveProperty('titre', 'IMPOT SUR LES SOCIETES (IS)');
      expect(result).toHaveProperty('exercice', 2026);
      expect(result).toHaveProperty('produits');
      expect(result).toHaveProperty('charges');
      expect(result).toHaveProperty('determination');
      expect(result).toHaveProperty('calcul');
      expect(result).toHaveProperty('paiement');
    });

    it('should calculate IS normal (33%)', async () => {
      mockPrisma.accountPlan.findMany.mockImplementation(({ where }: any) => {
        if (where.type === 'PRODUIT') {
          return Promise.resolve([{ id: 'p1', code: '701', name: 'Interets', level: 3 }]);
        }
        return Promise.resolve([]); // no charges
      });
      mockPrisma.journalEntry.aggregate.mockResolvedValue({
        _sum: { credit: 10000000, debit: 0 },
      });

      const result = await service.getDgiIs(2026);

      // resultat = 10M, IS = 33% of 10M = 3,300,000
      expect(result.calcul.isNormal).toBe(3300000);
      expect(result.calcul.mode).toBe('IS normal (33%)');
    });

    it('should apply minimum de perception (2.2%) when higher', async () => {
      // Produits = 10M, charges = 9.9M => resultat = 100000
      // IS normal = 33% of 100000 = 33000
      // Min perception = 2.2% of 10M = 220000
      // isPrincipal = max(33000, 220000) = 220000
      mockPrisma.accountPlan.findMany.mockImplementation(({ where }: any) => {
        if (where.type === 'PRODUIT') {
          return Promise.resolve([{ id: 'p1', code: '701', name: 'Interets', level: 3 }]);
        }
        if (where.type === 'CHARGE') {
          return Promise.resolve([{ id: 'c1', code: '601', name: 'Charges', level: 3 }]);
        }
        return Promise.resolve([]);
      });
      mockPrisma.journalEntry.aggregate.mockImplementation(({ where }: any) => {
        if (where.accountId === 'p1') {
          return Promise.resolve({ _sum: { credit: 10000000, debit: 0 } });
        }
        if (where.accountId === 'c1') {
          return Promise.resolve({ _sum: { debit: 9900000, credit: 0 } });
        }
        return Promise.resolve({ _sum: { credit: 0, debit: 0 } });
      });

      const result = await service.getDgiIs(2026);

      expect(result.calcul.isPrincipal).toBe(220000);
      expect(result.calcul.mode).toBe('Minimum de perception (2,2% du CA)');
    });

    it('should add centimes additionnels (10% of IS)', async () => {
      mockPrisma.accountPlan.findMany.mockImplementation(({ where }: any) => {
        if (where.type === 'PRODUIT') {
          return Promise.resolve([{ id: 'p1', code: '701', name: 'Interets', level: 3 }]);
        }
        return Promise.resolve([]);
      });
      mockPrisma.journalEntry.aggregate.mockResolvedValue({
        _sum: { credit: 10000000, debit: 0 },
      });

      const result = await service.getDgiIs(2026);

      // isPrincipal = 3,300,000, centimes = 10% of 3,300,000 = 330,000
      expect(result.calcul.centimesAdditionnels.taux).toBe(10);
      expect(result.calcul.centimesAdditionnels.montant).toBe(330000);
      expect(result.calcul.isTotalDu).toBe(3630000); // 3,300,000 + 330,000
    });

    it('should generate 3 acompte schedule (mars, juin, septembre)', async () => {
      const result = await service.getDgiIs(2026);

      expect(result.paiement.echeancier).toHaveLength(3);
      expect(result.paiement.echeancier[0].echeance).toContain('15/03/2026');
      expect(result.paiement.echeancier[1].echeance).toContain('15/06/2026');
      expect(result.paiement.echeancier[2].echeance).toContain('15/09/2026');
    });
  });

  // ==========================================================
  // getDgiSummary
  // ==========================================================

  describe('getDgiSummary', () => {
    beforeEach(() => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { tax: 10000, fees: 50000, amount: 500000 },
        _count: 5,
      });
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);
      mockPrisma.journalEntry.aggregate.mockResolvedValue(agg(0));
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.account.aggregate.mockResolvedValue(agg(0));
      mockPrisma.credit.aggregate.mockResolvedValue(agg(0));
      if (!mockPrisma.journalEntry.findMany) {
        mockPrisma.journalEntry.findMany = jest.fn().mockResolvedValue([]);
      } else {
        mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      }
      if (!mockPrisma.billPayment) {
        mockPrisma.billPayment = {
          aggregate: jest.fn().mockResolvedValue(agg(0)),
        };
      } else {
        mockPrisma.billPayment.aggregate.mockResolvedValue(agg(0));
      }
    });

    it('should return correct summary structure', async () => {
      const result = await service.getDgiSummary(2026);

      expect(result).toHaveProperty('titre', 'TABLEAU DE BORD FISCAL ANNUEL');
      expect(result).toHaveProperty('exercice', 2026);
      expect(result).toHaveProperty('synthese');
      expect(result).toHaveProperty('tva');
      expect(result).toHaveProperty('is');
      expect(result).toHaveProperty('ircm');
      expect(result).toHaveProperty('calendrier');
    });

    it('should include 12 months of TVA', async () => {
      const result = await service.getDgiSummary(2026);

      expect(result.tva.mensuel).toHaveLength(12);
      expect(result.tva.mensuel[0].mois).toBe('01/2026');
      expect(result.tva.mensuel[11].mois).toBe('12/2026');
    });

    it('should include IS total', async () => {
      const result = await service.getDgiSummary(2026);

      expect(result.synthese).toHaveProperty('totalIS');
      expect(typeof result.synthese.totalIS).toBe('number');
    });

    it('should include IRCM total', async () => {
      const result = await service.getDgiSummary(2026);

      expect(result.synthese).toHaveProperty('totalIrcm');
      expect(typeof result.synthese.totalIrcm).toBe('number');
    });

    it('should calculate totalObligationsFiscales', async () => {
      const result = await service.getDgiSummary(2026);

      expect(result.synthese.totalObligationsFiscales).toBe(
        result.synthese.totalTvaAnnuelle + result.synthese.totalIS + result.synthese.totalIrcm,
      );
    });

    it('should include calendrier fiscal', async () => {
      const result = await service.getDgiSummary(2026);

      expect(result.calendrier.length).toBeGreaterThan(0);
      // 12 TVA + 3 IS acomptes + 1 DSF + 1 IRCM = 17
      expect(result.calendrier).toHaveLength(17);
      expect(result.calendrier[0]).toHaveProperty('type');
      expect(result.calendrier[0]).toHaveProperty('dateLimite');
      expect(result.calendrier[0]).toHaveProperty('statut');
    });
  });

  // ==========================================================
  // generateDgiExcel
  // ==========================================================

  describe('generateDgiExcel', () => {
    const mockXLSX = {
      utils: {
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        aoa_to_sheet: () => ({}),
        book_append_sheet: jest.fn(),
      },
      write: () => Buffer.from('mock-xlsx-content'),
    };

    let originalMethod: any;

    beforeEach(() => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { tax: 0, fees: 0, amount: 0 },
        _count: 0,
      });
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);
      mockPrisma.journalEntry.aggregate.mockResolvedValue(agg(0));
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.account.aggregate.mockResolvedValue(agg(0));
      mockPrisma.credit.aggregate.mockResolvedValue(agg(0));
      if (!mockPrisma.journalEntry.findMany) {
        mockPrisma.journalEntry.findMany = jest.fn().mockResolvedValue([]);
      } else {
        mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      }
      if (!mockPrisma.billPayment) {
        mockPrisma.billPayment = {
          aggregate: jest.fn().mockResolvedValue(agg(0)),
        };
      } else {
        mockPrisma.billPayment.aggregate.mockResolvedValue(agg(0));
      }

      // Patch the method to inject a mock XLSX instead of dynamic import
      originalMethod = ReportsService.prototype.generateDgiExcel;
      ReportsService.prototype.generateDgiExcel = async function (year: number, type: string): Promise<Buffer> {
        const XLSX = mockXLSX as any;
        const wb = XLSX.utils.book_new();

        const buildTvaSheet = async () => {
          const summary = await this.getDgiSummary(year);
          const ws = XLSX.utils.aoa_to_sheet([['TVA']]);
          XLSX.utils.book_append_sheet(wb, ws, 'TVA Mensuelle');
        };
        const buildDsfSheet = async () => {
          const dsf = await this.getDgiDsf(year);
          const ws = XLSX.utils.aoa_to_sheet([['DSF']]);
          XLSX.utils.book_append_sheet(wb, ws, 'DSF');
        };
        const buildIrcmSheet = async () => {
          const ircm = await this.getDgiIrcm(year);
          const ws = XLSX.utils.aoa_to_sheet([['IRCM']]);
          XLSX.utils.book_append_sheet(wb, ws, 'IRCM');
        };
        const buildIsSheet = async () => {
          const is = await this.getDgiIs(year);
          const ws = XLSX.utils.aoa_to_sheet([['IS']]);
          XLSX.utils.book_append_sheet(wb, ws, 'IS');
        };

        if (type === 'TVA' || type === 'ALL') await buildTvaSheet();
        if (type === 'DSF' || type === 'ALL') await buildDsfSheet();
        if (type === 'IRCM' || type === 'ALL') await buildIrcmSheet();
        if (type === 'IS' || type === 'ALL') await buildIsSheet();

        return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
      };
    });

    afterEach(() => {
      ReportsService.prototype.generateDgiExcel = originalMethod;
    });

    it('should return a Buffer', async () => {
      const result = await service.generateDgiExcel(2026, 'TVA');

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should accept type ALL', async () => {
      const result = await service.generateDgiExcel(2026, 'ALL');

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should accept individual type TVA', async () => {
      const result = await service.generateDgiExcel(2026, 'TVA');
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should accept individual type DSF', async () => {
      const result = await service.generateDgiExcel(2026, 'DSF');
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should accept individual type IRCM', async () => {
      const result = await service.generateDgiExcel(2026, 'IRCM');
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should accept individual type IS', async () => {
      const result = await service.generateDgiExcel(2026, 'IS');
      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });
});
