import { Test, TestingModule } from '@nestjs/testing';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AccountingController', () => {
  let controller: AccountingController;

  const mockService = {
    seedAccountPlan: jest.fn(),
    getAccountPlan: jest.fn(),
    createAccountPlanEntry: jest.fn(),
    updateAccountPlanEntry: jest.fn(),
    deleteAccountPlanEntry: jest.fn(),
    getJournal: jest.fn(),
    getJournalAuxiliaire: jest.fn(),
    getGrandLivre: jest.fn(),
    getBalance: jest.fn(),
    getBilan: jest.fn(),
    getCompteResultat: jest.fn(),
    getFluxTresorerie: jest.fn(),
    getPeriods: jest.fn(),
    createPeriod: jest.fn(),
    closePeriod: jest.fn(),
    getPeriodStats: jest.fn(),
    closeAnnualPeriod: jest.fn(),
    closeDailyPeriod: jest.fn(),
    closeMonthlyPeriod: jest.fn(),
    importBankStatementLines: jest.fn(),
    getBankStatementLines: jest.fn(),
    deleteBankLine: jest.fn(),
    autoReconcile: jest.fn(),
    manualMatch: jest.fn(),
    unmatch: jest.fn(),
    getReconciliationSummary: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingController],
      providers: [
        { provide: AccountingService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AccountingController>(AccountingController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== PLAN COMPTABLE ====================

  describe('seedPlan', () => {
    it('should call seedAccountPlan', async () => {
      mockService.seedAccountPlan.mockResolvedValue({ message: '37 comptes crees' });

      const result = await controller.seedPlan();

      expect(result.message).toContain('comptes');
      expect(mockService.seedAccountPlan).toHaveBeenCalled();
    });
  });

  describe('getPlan', () => {
    it('should call getAccountPlan', async () => {
      mockService.getAccountPlan.mockResolvedValue([{ code: '1' }]);

      const result = await controller.getPlan();

      expect(result).toHaveLength(1);
    });
  });

  describe('createAccountPlan', () => {
    it('should call createAccountPlanEntry with dto', async () => {
      const dto = { code: '204', name: 'Credits personnel', type: 'ACTIF', level: 3, parentCode: '20' };
      mockService.createAccountPlanEntry.mockResolvedValue({ id: 'ap-1', ...dto });

      const result = await controller.createAccountPlan(dto as any);

      expect(result.code).toBe('204');
      expect(mockService.createAccountPlanEntry).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateAccountPlan', () => {
    it('should call updateAccountPlanEntry with code and dto', async () => {
      const dto = { name: 'Updated Name' };
      mockService.updateAccountPlanEntry.mockResolvedValue({ code: '201', name: 'Updated Name' });

      const result = await controller.updateAccountPlan('201', dto as any);

      expect(result.name).toBe('Updated Name');
      expect(mockService.updateAccountPlanEntry).toHaveBeenCalledWith('201', dto);
    });
  });

  describe('deleteAccountPlan', () => {
    it('should call deleteAccountPlanEntry with code', async () => {
      mockService.deleteAccountPlanEntry.mockResolvedValue({ message: 'Compte 204 supprime' });

      const result = await controller.deleteAccountPlan('204');

      expect(result.message).toContain('204');
      expect(mockService.deleteAccountPlanEntry).toHaveBeenCalledWith('204');
    });
  });

  // ==================== JOURNAL ====================

  describe('getJournal', () => {
    it('should call getJournal with parsed params', async () => {
      mockService.getJournal.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });

      await controller.getJournal('2', '25', '2026-01-01', '2026-06-30', '101', 'a1');

      expect(mockService.getJournal).toHaveBeenCalledWith({
        page: 2, limit: 25, startDate: '2026-01-01', endDate: '2026-06-30', accountCode: '101', agencyId: 'a1',
      });
    });

    it('should default page to 1 and limit to 50', async () => {
      mockService.getJournal.mockResolvedValue({ data: [], total: 0 });

      await controller.getJournal(undefined, undefined, undefined, undefined, undefined, undefined);

      expect(mockService.getJournal).toHaveBeenCalledWith({
        page: 1, limit: 50, startDate: undefined, endDate: undefined, accountCode: undefined, agencyId: undefined,
      });
    });
  });

  describe('getJournalAuxiliaire', () => {
    it('should call getJournalAuxiliaire with parsed params', async () => {
      mockService.getJournalAuxiliaire.mockResolvedValue({ type: 'CAISSE', data: [] });

      await controller.getJournalAuxiliaire('CAISSE', '1', '20', '2026-01-01', '2026-06-30');

      expect(mockService.getJournalAuxiliaire).toHaveBeenCalledWith({
        type: 'CAISSE', page: 1, limit: 20, startDate: '2026-01-01', endDate: '2026-06-30',
      });
    });

    it('should default type to CAISSE when falsy', async () => {
      mockService.getJournalAuxiliaire.mockResolvedValue({ type: 'CAISSE', data: [] });

      await controller.getJournalAuxiliaire(undefined as any, undefined, undefined, undefined, undefined);

      expect(mockService.getJournalAuxiliaire).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CAISSE' }),
      );
    });
  });

  // ==================== GRAND LIVRE ====================

  describe('getGrandLivre', () => {
    it('should call getGrandLivre with code and parsed params', async () => {
      mockService.getGrandLivre.mockResolvedValue({ compte: {}, entries: [] });

      await controller.getGrandLivre('101', '2026-01-01', '2026-12-31', '2', '10');

      expect(mockService.getGrandLivre).toHaveBeenCalledWith('101', {
        startDate: '2026-01-01', endDate: '2026-12-31', page: 2, limit: 10,
      });
    });
  });

  // ==================== REPORTS ====================

  describe('getBalance', () => {
    it('should call getBalance with dates', async () => {
      mockService.getBalance.mockResolvedValue([]);

      await controller.getBalance('2026-01-01', '2026-12-31');

      expect(mockService.getBalance).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    });
  });

  describe('getBilan', () => {
    it('should call getBilan with dates', async () => {
      mockService.getBilan.mockResolvedValue({ actif: [], passif: [] });

      await controller.getBilan('2026-01-01', '2026-12-31');

      expect(mockService.getBilan).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    });
  });

  describe('getCompteResultat', () => {
    it('should call getCompteResultat with dates', async () => {
      mockService.getCompteResultat.mockResolvedValue({ charges: [], produits: [] });

      await controller.getCompteResultat('2026-01-01', '2026-12-31');

      expect(mockService.getCompteResultat).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    });
  });

  describe('getFluxTresorerie', () => {
    it('should call getFluxTresorerie with dates', async () => {
      mockService.getFluxTresorerie.mockResolvedValue({});

      await controller.getFluxTresorerie('2026-01-01', '2026-12-31');

      expect(mockService.getFluxTresorerie).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    });
  });

  // ==================== PERIODES ====================

  describe('getPeriods', () => {
    it('should call getPeriods', async () => {
      mockService.getPeriods.mockResolvedValue([]);

      const result = await controller.getPeriods();

      expect(result).toEqual([]);
    });
  });

  describe('createPeriod', () => {
    it('should call createPeriod with body', async () => {
      const body = { name: 'Ex 2026', startDate: '2026-01-01', endDate: '2026-12-31' };
      mockService.createPeriod.mockResolvedValue({ id: 'p1' });

      await controller.createPeriod(body);

      expect(mockService.createPeriod).toHaveBeenCalledWith(body);
    });
  });

  describe('closePeriod', () => {
    it('should call closePeriod with id and user.sub', async () => {
      const user = { sub: 'user-1' };
      mockService.closePeriod.mockResolvedValue({ id: 'p1', status: 'CLOSED' });

      const result = await controller.closePeriod('p1', user);

      expect(result.status).toBe('CLOSED');
      expect(mockService.closePeriod).toHaveBeenCalledWith('p1', 'user-1');
    });
  });

  describe('getPeriodStats', () => {
    it('should call getPeriodStats with id', async () => {
      mockService.getPeriodStats.mockResolvedValue({ entriesCount: 50 });

      const result = await controller.getPeriodStats('p1');

      expect(result.entriesCount).toBe(50);
      expect(mockService.getPeriodStats).toHaveBeenCalledWith('p1');
    });
  });

  describe('closeAnnualPeriod', () => {
    it('should call closeAnnualPeriod with id, user.sub, and agencyId', async () => {
      const user = { sub: 'admin-1' };
      mockService.closeAnnualPeriod.mockResolvedValue({ resultat: 150000, type: 'BENEFICE' });

      const result = await controller.closeAnnualPeriod('p1', user, { agencyId: 'a1' });

      expect(result.type).toBe('BENEFICE');
      expect(mockService.closeAnnualPeriod).toHaveBeenCalledWith('p1', 'admin-1', 'a1');
    });
  });

  // ==================== CLOTURES ====================

  describe('closeDailyPeriod', () => {
    it('should call closeDailyPeriod with date, user.sub, and agencyId', async () => {
      const user = { sub: 'comptable-1' };
      mockService.closeDailyPeriod.mockResolvedValue({ message: 'OK' });

      await controller.closeDailyPeriod({ date: '2026-07-15', agencyId: 'a1' }, user);

      expect(mockService.closeDailyPeriod).toHaveBeenCalledWith('2026-07-15', 'comptable-1', 'a1');
    });
  });

  describe('closeMonthlyPeriod', () => {
    it('should call closeMonthlyPeriod with year, month, user.sub, and agencyId', async () => {
      const user = { sub: 'comptable-1' };
      mockService.closeMonthlyPeriod.mockResolvedValue({ message: 'OK' });

      await controller.closeMonthlyPeriod({ year: 2026, month: 6, agencyId: 'a1' }, user);

      expect(mockService.closeMonthlyPeriod).toHaveBeenCalledWith(2026, 6, 'comptable-1', 'a1');
    });
  });

  // ==================== RAPPROCHEMENT BANCAIRE ====================

  describe('importBankStatement', () => {
    it('should call importBankStatementLines with lines', async () => {
      const lines = [{ date: '2026-07-01', label: 'Virement', debit: 0, credit: 100000 }];
      mockService.importBankStatementLines.mockResolvedValue({ imported: 1 });

      const result = await controller.importBankStatement({ lines });

      expect(result.imported).toBe(1);
      expect(mockService.importBankStatementLines).toHaveBeenCalledWith(lines);
    });
  });

  describe('getBankStatement', () => {
    it('should call getBankStatementLines with query params', async () => {
      mockService.getBankStatementLines.mockResolvedValue({ lines: [], total: 0 });

      await controller.getBankStatement('2026-01-01', '2026-06-30', 'false');

      expect(mockService.getBankStatementLines).toHaveBeenCalledWith({
        startDate: '2026-01-01', endDate: '2026-06-30', matched: 'false',
      });
    });
  });

  describe('deleteBankLine', () => {
    it('should call deleteBankLine with id', async () => {
      mockService.deleteBankLine.mockResolvedValue({ success: true });

      const result = await controller.deleteBankLine('bl-1');

      expect(result.success).toBe(true);
      expect(mockService.deleteBankLine).toHaveBeenCalledWith('bl-1');
    });
  });

  describe('autoReconcile', () => {
    it('should call autoReconcile with dates', async () => {
      mockService.autoReconcile.mockResolvedValue({ matched: 5, remaining: 3 });

      const result = await controller.autoReconcile('2026-01-01', '2026-06-30');

      expect(result.matched).toBe(5);
      expect(mockService.autoReconcile).toHaveBeenCalledWith('2026-01-01', '2026-06-30');
    });
  });

  describe('manualMatch', () => {
    it('should call manualMatch with bankLineId and journalEntryId', async () => {
      mockService.manualMatch.mockResolvedValue({ success: true });

      const result = await controller.manualMatch({ bankLineId: 'bl-1', journalEntryId: 'je-1' });

      expect(result.success).toBe(true);
      expect(mockService.manualMatch).toHaveBeenCalledWith('bl-1', 'je-1');
    });
  });

  describe('unmatch', () => {
    it('should call unmatch with id', async () => {
      mockService.unmatch.mockResolvedValue({ success: true });

      const result = await controller.unmatch('bl-1');

      expect(result.success).toBe(true);
      expect(mockService.unmatch).toHaveBeenCalledWith('bl-1');
    });
  });

  describe('getReconciliationSummary', () => {
    it('should call getReconciliationSummary with dates', async () => {
      mockService.getReconciliationSummary.mockResolvedValue({ ecart: 0 });

      const result = await controller.getReconciliationSummary('2026-01-01', '2026-06-30');

      expect(result.ecart).toBe(0);
      expect(mockService.getReconciliationSummary).toHaveBeenCalledWith('2026-01-01', '2026-06-30');
    });
  });
});
