import { Test, TestingModule } from '@nestjs/testing';
import { AccountingService } from './accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('AccountingService', () => {
  let service: AccountingService;

  const mockPrisma = {
    accountPlan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    journalEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    accountingPeriod: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cashRegister: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    transaction: {
      count: jest.fn(),
    },
    bankStatementLine: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AccountingService>(AccountingService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== PLAN COMPTABLE ====================

  describe('seedAccountPlan', () => {
    it('should upsert all EMF SYSCOHADA accounts and return count', async () => {
      mockPrisma.accountPlan.upsert.mockResolvedValue({});

      const result = await service.seedAccountPlan();

      expect(result.message).toMatch(/comptes du plan comptable EMF crees/);
      expect(mockPrisma.accountPlan.upsert).toHaveBeenCalled();
      // Should have seeded a substantial number of accounts
      expect(mockPrisma.accountPlan.upsert.mock.calls.length).toBeGreaterThan(20);
    });
  });

  describe('getAccountPlan', () => {
    it('should return all accounts ordered by code', async () => {
      const accounts = [
        { code: '1', name: 'Tresorerie', type: 'ACTIF' },
        { code: '10', name: 'Caisse', type: 'ACTIF' },
      ];
      mockPrisma.accountPlan.findMany.mockResolvedValue(accounts);

      const result = await service.getAccountPlan();

      expect(result).toEqual(accounts);
      expect(mockPrisma.accountPlan.findMany).toHaveBeenCalledWith({ orderBy: { code: 'asc' } });
    });
  });

  describe('createAccountPlanEntry', () => {
    const dto = { code: '204', name: 'Credits au personnel', type: 'ACTIF', level: 3, parentCode: '20' };

    it('should create a new account plan entry', async () => {
      mockPrisma.accountPlan.findUnique
        .mockResolvedValueOnce(null) // code does not exist
        .mockResolvedValueOnce({ code: '20', name: 'Parent' }); // parent exists
      mockPrisma.accountPlan.create.mockResolvedValue({ id: 'ap-1', ...dto });

      const result = await service.createAccountPlanEntry(dto);

      expect(result.code).toBe('204');
      expect(mockPrisma.accountPlan.create).toHaveBeenCalledWith({ data: dto });
    });

    it('should throw BadRequestException when code already exists', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValueOnce({ code: '204' });

      await expect(service.createAccountPlanEntry(dto)).rejects.toThrow(BadRequestException);

      mockPrisma.accountPlan.findUnique.mockResolvedValueOnce({ code: '204' });

      await expect(service.createAccountPlanEntry(dto)).rejects.toThrow('existe deja');
    });

    it('should throw BadRequestException when parent code does not exist', async () => {
      mockPrisma.accountPlan.findUnique
        .mockResolvedValueOnce(null) // code does not exist
        .mockResolvedValueOnce(null); // parent not found

      await expect(service.createAccountPlanEntry(dto)).rejects.toThrow(BadRequestException);
      await expect(service.createAccountPlanEntry(dto)).rejects.toThrow('parent');
    });

    it('should create an entry without parent code', async () => {
      const dtoNoParent = { code: '5', name: 'Classe 5', type: 'ACTIF', level: 1 };
      mockPrisma.accountPlan.findUnique.mockResolvedValueOnce(null);
      mockPrisma.accountPlan.create.mockResolvedValue({ id: 'ap-2', ...dtoNoParent });

      const result = await service.createAccountPlanEntry(dtoNoParent);

      expect(result.code).toBe('5');
      // findUnique should only be called once (for code check, not parent)
      expect(mockPrisma.accountPlan.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateAccountPlanEntry', () => {
    it('should update an existing account plan entry', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ code: '201', name: 'Old' });
      mockPrisma.accountPlan.update.mockResolvedValue({ code: '201', name: 'New Name' });

      const result = await service.updateAccountPlanEntry('201', { name: 'New Name' });

      expect(result.name).toBe('New Name');
    });

    it('should throw NotFoundException when account does not exist', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue(null);

      await expect(service.updateAccountPlanEntry('999', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccountPlanEntry', () => {
    it('should delete an account with no entries or children', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'ap-1', code: '204' });
      mockPrisma.journalEntry.count.mockResolvedValue(0);
      mockPrisma.accountPlan.count.mockResolvedValue(0);
      mockPrisma.accountPlan.delete.mockResolvedValue({});

      const result = await service.deleteAccountPlanEntry('204');

      expect(result.message).toContain('204');
      expect(result.message).toContain('supprime');
    });

    it('should throw NotFoundException when account does not exist', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccountPlanEntry('999')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when account has linked journal entries', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'ap-1', code: '201' });
      mockPrisma.journalEntry.count.mockResolvedValue(5);

      await expect(service.deleteAccountPlanEntry('201')).rejects.toThrow(BadRequestException);
      await expect(service.deleteAccountPlanEntry('201')).rejects.toThrow('ecriture');
    });

    it('should throw BadRequestException when account has children', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'ap-1', code: '20' });
      mockPrisma.journalEntry.count.mockResolvedValue(0);
      mockPrisma.accountPlan.count.mockResolvedValue(3);

      await expect(service.deleteAccountPlanEntry('20')).rejects.toThrow(BadRequestException);
      await expect(service.deleteAccountPlanEntry('20')).rejects.toThrow('sous-compte');
    });
  });

  // ==================== JOURNAL ENTRIES ====================

  describe('createEntry', () => {
    const entryData = {
      date: new Date('2026-01-15'),
      debitAccountCode: '101',
      creditAccountCode: '221',
      amount: 50000,
      label: 'Depot client',
      reference: 'TX-001',
      agencyId: 'a1',
    };

    it('should create a double-entry (debit + credit lines)', async () => {
      mockPrisma.accountPlan.findUnique
        .mockResolvedValueOnce({ id: 'acc-debit', code: '101' })
        .mockResolvedValueOnce({ id: 'acc-credit', code: '221' });
      mockPrisma.accountingPeriod.findFirst.mockResolvedValue({ id: 'period-1' });
      mockPrisma.journalEntry.count.mockResolvedValue(0);
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'je-1', debit: 50000, credit: 0 },
        { id: 'je-2', debit: 0, credit: 50000 },
      ]);

      const result = await service.createEntry(entryData, 'user-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when debit account not found', async () => {
      mockPrisma.accountPlan.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'acc-credit' });

      await expect(service.createEntry(entryData)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when credit account not found', async () => {
      mockPrisma.accountPlan.findUnique
        .mockResolvedValueOnce({ id: 'acc-debit' })
        .mockResolvedValueOnce(null);

      await expect(service.createEntry(entryData)).rejects.toThrow(NotFoundException);
    });

    it('should handle entries when no open period exists', async () => {
      mockPrisma.accountPlan.findUnique
        .mockResolvedValueOnce({ id: 'acc-d' })
        .mockResolvedValueOnce({ id: 'acc-c' });
      mockPrisma.accountingPeriod.findFirst.mockResolvedValue(null);
      mockPrisma.journalEntry.count.mockResolvedValue(0);
      mockPrisma.$transaction.mockResolvedValue([{ id: 'je-1' }, { id: 'je-2' }]);

      const result = await service.createEntry(entryData);

      expect(result).toHaveLength(2);
      // periodId should be undefined (null period)
      const txArgs = mockPrisma.$transaction.mock.calls[0][0];
      expect(txArgs).toHaveLength(2);
    });
  });

  // ==================== JOURNAL ====================

  describe('getJournal', () => {
    it('should return paginated journal entries', async () => {
      mockPrisma.journalEntry.findMany.mockResolvedValue([{ id: 'je-1' }]);
      mockPrisma.journalEntry.count.mockResolvedValue(1);

      const result = await service.getJournal({ page: 1, limit: 50 });

      expect(result).toEqual({ data: [{ id: 'je-1' }], total: 1, page: 1, limit: 50 });
    });

    it('should filter by accountCode when provided', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'acc-1', code: '101' });
      mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.count.mockResolvedValue(0);

      await service.getJournal({ accountCode: '101' });

      expect(mockPrisma.accountPlan.findUnique).toHaveBeenCalledWith({ where: { code: '101' } });
    });

    it('should filter by date range', async () => {
      mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.count.mockResolvedValue(0);

      await service.getJournal({ startDate: '2026-01-01', endDate: '2026-01-31' });

      expect(mockPrisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by agencyId', async () => {
      mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.count.mockResolvedValue(0);

      await service.getJournal({ agencyId: 'a1' });

      expect(mockPrisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agencyId: 'a1' }),
        }),
      );
    });
  });

  // ==================== JOURNAL AUXILIAIRE ====================

  describe('getJournalAuxiliaire', () => {
    beforeEach(() => {
      mockPrisma.accountPlan.findMany.mockImplementation(({ where }) => {
        if (where.code.in.includes('101')) return Promise.resolve([{ id: 'caisse-1' }, { id: 'caisse-2' }]);
        if (where.code.in.includes('111')) return Promise.resolve([{ id: 'banque-1' }]);
        return Promise.resolve([]);
      });
      mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.count.mockResolvedValue(0);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 0 } });
    });

    it('should filter CAISSE entries by caisse account IDs', async () => {
      const result = await service.getJournalAuxiliaire({ type: 'CAISSE' });

      expect(result.type).toBe('CAISSE');
      expect(mockPrisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountId: { in: ['caisse-1', 'caisse-2'] },
          }),
        }),
      );
    });

    it('should filter BANQUE entries by banque account IDs', async () => {
      const result = await service.getJournalAuxiliaire({ type: 'BANQUE' });

      expect(result.type).toBe('BANQUE');
      expect(mockPrisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountId: { in: ['banque-1'] },
          }),
        }),
      );
    });

    it('should filter OD entries by excluding caisse and banque accounts', async () => {
      const result = await service.getJournalAuxiliaire({ type: 'OD' });

      expect(result.type).toBe('OD');
      expect(mockPrisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountId: { notIn: ['caisse-1', 'caisse-2', 'banque-1'] },
          }),
        }),
      );
    });

    it('should return totals', async () => {
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 500000, credit: 300000 } });

      const result = await service.getJournalAuxiliaire({ type: 'CAISSE' });

      expect(result.totalDebit).toBe(500000);
      expect(result.totalCredit).toBe(300000);
    });
  });

  // ==================== BALANCE ====================

  describe('getBalance', () => {
    it('should return balance for accounts with movements', async () => {
      mockPrisma.accountPlan.findMany.mockResolvedValue([
        { id: 'a1', code: '101', name: 'Caisse', type: 'ACTIF' },
        { id: 'a2', code: '221', name: 'Comptes courants', type: 'PASSIF' },
        { id: 'a3', code: '702', name: 'Commissions', type: 'PRODUIT' },
      ]);
      mockPrisma.journalEntry.aggregate
        .mockResolvedValueOnce({ _sum: { debit: 1000000, credit: 200000 } }) // 101
        .mockResolvedValueOnce({ _sum: { debit: 100000, credit: 800000 } }) // 221
        .mockResolvedValueOnce({ _sum: { debit: 0, credit: 0 } }); // 702 - no movement

      const result = await service.getBalance();

      expect(result).toHaveLength(2); // 702 excluded (no movement)
      expect(result[0]).toEqual({
        code: '101', name: 'Caisse', type: 'ACTIF',
        totalDebit: 1000000, totalCredit: 200000,
        soldeDebiteur: 800000, soldeCrediteur: 0,
      });
      expect(result[1]).toEqual({
        code: '221', name: 'Comptes courants', type: 'PASSIF',
        totalDebit: 100000, totalCredit: 800000,
        soldeDebiteur: 0, soldeCrediteur: 700000,
      });
    });

    it('should accept date filters', async () => {
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);

      await service.getBalance('2026-01-01', '2026-06-30');

      // Called with level filter
      expect(mockPrisma.accountPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { level: { gte: 2 } },
        }),
      );
    });
  });

  // ==================== GRAND LIVRE ====================

  describe('getGrandLivre', () => {
    it('should return entries and totals for a specific account', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'acc-1', code: '101', name: 'Caisse', type: 'ACTIF' });
      mockPrisma.journalEntry.findMany.mockResolvedValue([{ id: 'je-1', debit: 100000 }]);
      mockPrisma.journalEntry.count.mockResolvedValue(1);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 500000, credit: 200000 } });

      const result = await service.getGrandLivre('101', {});

      expect(result.compte).toEqual({ code: '101', name: 'Caisse', type: 'ACTIF' });
      expect(result.totalDebit).toBe(500000);
      expect(result.totalCredit).toBe(200000);
      expect(result.solde).toBe(300000);
      expect(result.entries).toHaveLength(1);
    });

    it('should throw NotFoundException when account does not exist', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue(null);

      await expect(service.getGrandLivre('999', {})).rejects.toThrow(NotFoundException);
    });

    it('should apply date and pagination filters', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'acc-1', code: '101', name: 'Caisse', type: 'ACTIF' });
      mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.count.mockResolvedValue(0);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 0 } });

      const result = await service.getGrandLivre('101', { startDate: '2026-01-01', endDate: '2026-12-31', page: 2, limit: 10 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(mockPrisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  // ==================== BILAN ====================

  describe('getBilan', () => {
    it('should return actif, passif, and resultat', async () => {
      mockPrisma.accountPlan.findMany.mockResolvedValue([
        { id: 'a1', code: '101', name: 'Caisse', type: 'ACTIF', level: 2 },
        { id: 'a2', code: '221', name: 'Comptes courants', type: 'PASSIF', level: 3 },
        { id: 'a3', code: '60', name: 'Charges exploitation', type: 'CHARGE', level: 2 },
        { id: 'a4', code: '70', name: 'Produits exploitation', type: 'PRODUIT', level: 2 },
      ]);
      mockPrisma.journalEntry.aggregate
        .mockResolvedValueOnce({ _sum: { debit: 1000000, credit: 200000 } }) // 101 actif
        .mockResolvedValueOnce({ _sum: { debit: 100000, credit: 800000 } }) // 221 passif
        .mockResolvedValueOnce({ _sum: { debit: 0, credit: 0 } }) // 60 charge (skip)
        .mockResolvedValueOnce({ _sum: { debit: 0, credit: 0 } }) // 70 produit (skip)
        // charges loop
        .mockResolvedValueOnce({ _sum: { debit: 200000, credit: 0 } }) // charge 60
        // produits loop
        .mockResolvedValueOnce({ _sum: { debit: 0, credit: 350000 } }); // produit 70

      const result = await service.getBilan();

      expect(result).toHaveProperty('actif');
      expect(result).toHaveProperty('passif');
      expect(result).toHaveProperty('totalActif');
      expect(result).toHaveProperty('totalPassif');
      expect(result).toHaveProperty('resultat');
      expect(result.resultat).toBe(150000); // 350000 - 200000
    });
  });

  // ==================== COMPTE DE RESULTAT ====================

  describe('getCompteResultat', () => {
    it('should return charges, produits, and resultat', async () => {
      mockPrisma.accountPlan.findMany.mockResolvedValue([
        { id: 'c1', code: '60', name: 'Charges exploitation', type: 'CHARGE', level: 2 },
        { id: 'p1', code: '70', name: 'Produits exploitation', type: 'PRODUIT', level: 2 },
      ]);
      mockPrisma.journalEntry.aggregate
        .mockResolvedValueOnce({ _sum: { debit: 300000, credit: 0 } }) // charge
        .mockResolvedValueOnce({ _sum: { debit: 0, credit: 500000 } }); // produit

      const result = await service.getCompteResultat();

      expect(result.totalCharges).toBe(300000);
      expect(result.totalProduits).toBe(500000);
      expect(result.resultat).toBe(200000);
      expect(result.charges).toHaveLength(1);
      expect(result.produits).toHaveLength(1);
    });

    it('should skip accounts with no movements', async () => {
      mockPrisma.accountPlan.findMany.mockResolvedValue([
        { id: 'c1', code: '60', name: 'Charges', type: 'CHARGE', level: 2 },
      ]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 0 } });

      const result = await service.getCompteResultat();

      expect(result.charges).toHaveLength(0);
      expect(result.totalCharges).toBe(0);
    });
  });

  // ==================== FLUX DE TRESORERIE ====================

  describe('getFluxTresorerie', () => {
    beforeEach(() => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue(null);
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 0 } });
    });

    it('should return all three sections plus opening/closing treasury', async () => {
      const result = await service.getFluxTresorerie();

      expect(result).toHaveProperty('tresorerieOuverture');
      expect(result).toHaveProperty('exploitation');
      expect(result).toHaveProperty('investissement');
      expect(result).toHaveProperty('financement');
      expect(result).toHaveProperty('variationNette');
      expect(result).toHaveProperty('tresorerieCloture');
    });

    it('should calculate tresorerieOuverture when startDate is provided', async () => {
      mockPrisma.accountPlan.findMany.mockResolvedValue([
        { id: 'acc-101', code: '101' },
      ]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 200000, credit: 50000 } });
      mockPrisma.accountPlan.findUnique.mockResolvedValue(null);

      const result = await service.getFluxTresorerie('2026-01-01');

      expect(result.tresorerieOuverture).toBe(150000); // 200000 - 50000
    });

    it('should compute variationNette = exploitation + investissement + financement', async () => {
      const result = await service.getFluxTresorerie();

      expect(result.variationNette).toBe(
        result.exploitation.total + result.investissement.total + result.financement.total,
      );
    });
  });

  // ==================== PERIODES COMPTABLES ====================

  describe('createPeriod', () => {
    it('should create an accounting period', async () => {
      const periodData = { name: 'Exercice 2026', startDate: '2026-01-01', endDate: '2026-12-31' };
      mockPrisma.accountingPeriod.create.mockResolvedValue({
        id: 'p1', name: 'Exercice 2026',
        startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      });

      const result = await service.createPeriod(periodData);

      expect(result.name).toBe('Exercice 2026');
      expect(mockPrisma.accountingPeriod.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Exercice 2026',
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      });
    });
  });

  describe('closePeriod', () => {
    it('should close an open period', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue({ id: 'p1', name: 'Ex 2026', status: 'OPEN' });
      mockPrisma.accountingPeriod.update.mockResolvedValue({ id: 'p1', status: 'CLOSED' });

      const result = await service.closePeriod('p1', 'user-1');

      expect(result.status).toBe('CLOSED');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CLOSE_PERIOD',
          module: 'ACCOUNTING',
        }),
      );
    });

    it('should throw NotFoundException when period does not exist', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue(null);

      await expect(service.closePeriod('bad', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when period is already closed', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue({ id: 'p1', status: 'CLOSED' });

      await expect(service.closePeriod('p1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPeriods', () => {
    it('should return all periods ordered by startDate desc', async () => {
      mockPrisma.accountingPeriod.findMany.mockResolvedValue([{ id: 'p1' }]);

      const result = await service.getPeriods();

      expect(result).toHaveLength(1);
      expect(mockPrisma.accountingPeriod.findMany).toHaveBeenCalledWith({ orderBy: { startDate: 'desc' } });
    });
  });

  describe('getPeriodStats', () => {
    it('should return stats for a period', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p1', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      });
      mockPrisma.journalEntry.count.mockResolvedValue(100);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 5000000, credit: 5000000 } });
      mockPrisma.cashRegister.count.mockResolvedValue(2);

      const result = await service.getPeriodStats('p1');

      expect(result.entriesCount).toBe(100);
      expect(result.totalDebit).toBe(5000000);
      expect(result.totalCredit).toBe(5000000);
      expect(result.balanced).toBe(true);
      expect(result.openCashRegisters).toBe(2);
    });

    it('should detect imbalance', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'p1', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      });
      mockPrisma.journalEntry.count.mockResolvedValue(10);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 5000000, credit: 4999000 } });
      mockPrisma.cashRegister.count.mockResolvedValue(0);

      const result = await service.getPeriodStats('p1');

      expect(result.balanced).toBe(false);
    });

    it('should throw NotFoundException when period does not exist', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue(null);

      await expect(service.getPeriodStats('bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== CLOTURE JOURNALIERE ====================

  describe('closeDailyPeriod', () => {
    it('should close a daily period when all caisses are closed and balanced', async () => {
      mockPrisma.cashRegister.findMany.mockResolvedValue([]); // No open registers
      mockPrisma.journalEntry.aggregate.mockResolvedValue({
        _sum: { debit: 1000000, credit: 1000000 },
        _count: 20,
      });
      mockPrisma.transaction.count.mockResolvedValue(5);
      mockPrisma.accountingPeriod.create.mockResolvedValue({ id: 'dp-1', name: 'Journee 2026-07-15', status: 'CLOSED' });

      const result = await service.closeDailyPeriod('2026-07-15', 'user-1');

      expect(result.period.status).toBe('CLOSED');
      expect(result.summary.balanced).toBe(true);
      expect(result.message).toMatch(/Cloture journaliere du .+ effectuee/);
    });

    it('should throw BadRequestException when open cash registers exist', async () => {
      mockPrisma.cashRegister.findMany.mockResolvedValue([
        { id: 'cr-1', user: { firstName: 'Jean', lastName: 'Dupont' } },
      ]);

      await expect(service.closeDailyPeriod('2026-07-15', 'u1')).rejects.toThrow(BadRequestException);
      await expect(service.closeDailyPeriod('2026-07-15', 'u1')).rejects.toThrow('caisse');
    });

    it('should throw BadRequestException on accounting imbalance', async () => {
      mockPrisma.cashRegister.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({
        _sum: { debit: 1000000, credit: 990000 },
        _count: 20,
      });

      await expect(service.closeDailyPeriod('2026-07-15', 'u1')).rejects.toThrow(BadRequestException);
      await expect(service.closeDailyPeriod('2026-07-15', 'u1')).rejects.toThrow('Desequilibre');
    });
  });

  // ==================== CLOTURE MENSUELLE ====================

  describe('closeMonthlyPeriod', () => {
    it('should close a monthly period', async () => {
      mockPrisma.accountingPeriod.findFirst.mockResolvedValue(null); // Not already closed
      // getBalance inner calls
      mockPrisma.accountPlan.findMany.mockResolvedValue([]);
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 2000000, credit: 2000000 }, _count: 50 });
      mockPrisma.accountingPeriod.create.mockResolvedValue({
        id: 'mp-1', name: 'Mois 2026-06', status: 'CLOSED',
      });

      const result = await service.closeMonthlyPeriod(2026, 6, 'user-1', 'a1');

      expect(result.period.status).toBe('CLOSED');
      expect(result.message).toContain('2026-06');
    });

    it('should throw BadRequestException for future month', async () => {
      await expect(service.closeMonthlyPeriod(2099, 12, 'u1', 'a1')).rejects.toThrow(BadRequestException);
      await expect(service.closeMonthlyPeriod(2099, 12, 'u1', 'a1')).rejects.toThrow('futur');
    });

    it('should throw BadRequestException when month is already closed', async () => {
      mockPrisma.accountingPeriod.findFirst.mockResolvedValue({ id: 'existing', status: 'CLOSED' });

      await expect(service.closeMonthlyPeriod(2025, 1, 'u1', 'a1')).rejects.toThrow(BadRequestException);
      await expect(service.closeMonthlyPeriod(2025, 1, 'u1', 'a1')).rejects.toThrow('deja cloture');
    });
  });

  // ==================== RAPPROCHEMENT BANCAIRE ====================

  describe('importBankStatementLines', () => {
    it('should import bank statement lines', async () => {
      const lines = [
        { date: '2026-07-01', reference: 'REF-001', label: 'Virement', debit: 0, credit: 100000 },
        { date: '2026-07-02', label: 'Frais bancaires', debit: 5000, credit: 0 },
      ];
      mockPrisma.bankStatementLine.createMany.mockResolvedValue({ count: 2 });

      const result = await service.importBankStatementLines(lines);

      expect(result).toEqual({ imported: 2 });
      expect(mockPrisma.bankStatementLine.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ label: 'Virement', credit: 100000 }),
        ]),
      });
    });
  });

  describe('getBankStatementLines', () => {
    it('should return lines with totals', async () => {
      mockPrisma.bankStatementLine.findMany.mockResolvedValue([{ id: 'bl-1' }]);
      mockPrisma.bankStatementLine.count.mockResolvedValue(1);
      mockPrisma.bankStatementLine.aggregate.mockResolvedValue({ _sum: { debit: 5000, credit: 100000 } });

      const result = await service.getBankStatementLines({});

      expect(result.lines).toHaveLength(1);
      expect(result.totalDebit).toBe(5000);
      expect(result.totalCredit).toBe(100000);
    });

    it('should filter by matched=true', async () => {
      mockPrisma.bankStatementLine.findMany.mockResolvedValue([]);
      mockPrisma.bankStatementLine.count.mockResolvedValue(0);
      mockPrisma.bankStatementLine.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 0 } });

      await service.getBankStatementLines({ matched: 'true' });

      expect(mockPrisma.bankStatementLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ matched: true }),
        }),
      );
    });

    it('should filter by matched=false', async () => {
      mockPrisma.bankStatementLine.findMany.mockResolvedValue([]);
      mockPrisma.bankStatementLine.count.mockResolvedValue(0);
      mockPrisma.bankStatementLine.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 0 } });

      await service.getBankStatementLines({ matched: 'false' });

      expect(mockPrisma.bankStatementLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ matched: false }),
        }),
      );
    });
  });

  describe('autoReconcile', () => {
    it('should match bank lines with internal entries by amount and date', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'bank-acc', code: '111' });
      const entryDate = new Date('2026-07-01');
      mockPrisma.journalEntry.findMany.mockResolvedValue([
        { id: 'je-1', debit: 0, credit: 100000, date: entryDate },
      ]);
      mockPrisma.bankStatementLine.findMany.mockResolvedValue([
        { id: 'bl-1', debit: 100000, credit: 0, date: new Date('2026-07-01') },
      ]);
      mockPrisma.bankStatementLine.update.mockResolvedValue({});

      const result = await service.autoReconcile();

      expect(result.matched).toBe(1);
      expect(result.remaining).toBe(0);
    });

    it('should not match when date difference exceeds 2 days', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'bank-acc', code: '111' });
      mockPrisma.journalEntry.findMany.mockResolvedValue([
        { id: 'je-1', debit: 0, credit: 100000, date: new Date('2026-07-01') },
      ]);
      mockPrisma.bankStatementLine.findMany.mockResolvedValue([
        { id: 'bl-1', debit: 100000, credit: 0, date: new Date('2026-07-10') },
      ]);

      const result = await service.autoReconcile();

      expect(result.matched).toBe(0);
      expect(result.remaining).toBe(1);
    });

    it('should throw NotFoundException when bank account 111 not found', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue(null);

      await expect(service.autoReconcile()).rejects.toThrow(NotFoundException);
    });
  });

  describe('manualMatch', () => {
    it('should manually match a bank line with a journal entry', async () => {
      mockPrisma.bankStatementLine.findUnique.mockResolvedValue({ id: 'bl-1' });
      mockPrisma.bankStatementLine.update.mockResolvedValue({});

      const result = await service.manualMatch('bl-1', 'je-1');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.bankStatementLine.update).toHaveBeenCalledWith({
        where: { id: 'bl-1' },
        data: expect.objectContaining({
          matched: true,
          matchedJournalId: 'je-1',
        }),
      });
    });

    it('should throw NotFoundException when bank line not found', async () => {
      mockPrisma.bankStatementLine.findUnique.mockResolvedValue(null);

      await expect(service.manualMatch('bad', 'je-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unmatch', () => {
    it('should unset the match on a bank line', async () => {
      mockPrisma.bankStatementLine.update.mockResolvedValue({});

      const result = await service.unmatch('bl-1');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.bankStatementLine.update).toHaveBeenCalledWith({
        where: { id: 'bl-1' },
        data: { matched: false, matchedJournalId: null, reconciliationDate: null },
      });
    });
  });

  describe('deleteBankLine', () => {
    it('should delete a bank statement line', async () => {
      mockPrisma.bankStatementLine.delete.mockResolvedValue({});

      const result = await service.deleteBankLine('bl-1');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.bankStatementLine.delete).toHaveBeenCalledWith({ where: { id: 'bl-1' } });
    });
  });

  describe('getReconciliationSummary', () => {
    it('should return reconciliation summary with ecart', async () => {
      mockPrisma.accountPlan.findUnique.mockResolvedValue({ id: 'bank-acc', code: '111' });
      mockPrisma.journalEntry.aggregate.mockResolvedValue({ _sum: { debit: 1000000, credit: 200000 } });
      mockPrisma.bankStatementLine.aggregate
        .mockResolvedValueOnce({ _sum: { debit: 300000, credit: 1100000 }, _count: 10 }) // total
        .mockResolvedValueOnce({ _sum: { debit: 200000, credit: 900000 }, _count: 7 }) // matched
        .mockResolvedValueOnce({ _sum: { debit: 100000, credit: 200000 }, _count: 3 }); // unmatched
      mockPrisma.bankStatementLine.findMany.mockResolvedValue([]);

      const result = await service.getReconciliationSummary();

      expect(result).toHaveProperty('soldeInterne');
      expect(result).toHaveProperty('soldeBanque');
      expect(result).toHaveProperty('ecart');
      expect(result.soldeInterne).toBe(800000); // 1000000 - 200000
      expect(result.soldeBanque).toBe(800000); // 1100000 - 300000
      expect(result.lignesBancaires.total).toBe(10);
      expect(result.lignesBancaires.rapprochees).toBe(7);
      expect(result.lignesBancaires.nonRapprochees).toBe(3);
    });
  });
});
