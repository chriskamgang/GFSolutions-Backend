import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AmlService } from './aml.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AmlService', () => {
  let service: AmlService;
  let prisma: PrismaService;
  let auditService: AuditService;

  const mockPrismaService = {
    transaction: {
      findMany: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
    },
    amlAlert: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmlService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AmlService>(AmlService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ────────────────────────────────────────────────────────
  // analyzeTransaction
  // ────────────────────────────────────────────────────────
  describe('analyzeTransaction', () => {
    const transactionId = 'txn-1';
    const clientId = 'client-1';

    beforeEach(() => {
      mockPrismaService.transaction.findMany.mockResolvedValue([]);
      mockPrismaService.client.findUnique.mockResolvedValue({ isPEP: false, firstName: 'Jean', lastName: 'Dupont', raisonSociale: null });
      mockPrismaService.amlAlert.create.mockResolvedValue({ id: 'alert-1' });
    });

    it('should detect transaction >= 5M FCFA (SEUIL_DECLARATION)', async () => {
      const count = await service.analyzeTransaction(transactionId, 5_000_000, clientId, 'TRANSFER');

      expect(count).toBeGreaterThanOrEqual(1);
      expect(mockPrismaService.amlAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertType: 'SEUIL_DECLARATION',
            riskLevel: 'HIGH',
            clientId,
            transactionId,
            amount: 5_000_000,
          }),
        }),
      );
    });

    it('should detect transaction > 5M FCFA', async () => {
      const count = await service.analyzeTransaction(transactionId, 10_000_000, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const seuilAlert = calls.find((c: any) => c[0].data.alertType === 'SEUIL_DECLARATION');
      expect(seuilAlert).toBeDefined();
    });

    it('should NOT trigger SEUIL_DECLARATION for amount below 5M', async () => {
      const count = await service.analyzeTransaction(transactionId, 4_999_999, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const seuilAlert = calls.find((c: any) => c[0].data.alertType === 'SEUIL_DECLARATION');
      expect(seuilAlert).toBeUndefined();
    });

    it('should detect structuring (FRACTIONNEMENT) over 7 days', async () => {
      // Recent transactions that sum to 4M, current transaction is 1.5M (total 5.5M but current < 5M)
      mockPrismaService.transaction.findMany.mockResolvedValue([
        { amount: 2_000_000 },
        { amount: 2_000_000 },
      ]);

      const count = await service.analyzeTransaction(transactionId, 1_500_000, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const fractionnementAlert = calls.find((c: any) => c[0].data.alertType === 'FRACTIONNEMENT');
      expect(fractionnementAlert).toBeDefined();
      expect(fractionnementAlert[0].data.riskLevel).toBe('HIGH');
    });

    it('should NOT trigger FRACTIONNEMENT if current amount alone >= 5M (triggers SEUIL instead)', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        { amount: 1_000_000 },
      ]);

      const count = await service.analyzeTransaction(transactionId, 5_000_000, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const fractionnementAlert = calls.find((c: any) => c[0].data.alertType === 'FRACTIONNEMENT');
      expect(fractionnementAlert).toBeUndefined();
    });

    it('should NOT trigger FRACTIONNEMENT if total below threshold', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        { amount: 1_000_000 },
      ]);

      const count = await service.analyzeTransaction(transactionId, 500_000, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const fractionnementAlert = calls.find((c: any) => c[0].data.alertType === 'FRACTIONNEMENT');
      expect(fractionnementAlert).toBeUndefined();
    });

    it('should detect PEP transaction >= 1M FCFA', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue({
        isPEP: true,
        firstName: 'Paul',
        lastName: 'Biya',
        raisonSociale: null,
      });

      const count = await service.analyzeTransaction(transactionId, 1_000_000, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const pepAlert = calls.find((c: any) => c[0].data.alertType === 'PEP');
      expect(pepAlert).toBeDefined();
      expect(pepAlert[0].data.riskLevel).toBe('MEDIUM');
    });

    it('should NOT trigger PEP alert if client is not PEP', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue({
        isPEP: false,
        firstName: 'Jean',
        lastName: 'Dupont',
        raisonSociale: null,
      });

      await service.analyzeTransaction(transactionId, 2_000_000, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const pepAlert = calls.find((c: any) => c[0].data.alertType === 'PEP');
      expect(pepAlert).toBeUndefined();
    });

    it('should NOT trigger PEP alert if amount < 1M even for PEP client', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue({
        isPEP: true,
        firstName: 'Paul',
        lastName: 'Biya',
        raisonSociale: null,
      });

      await service.analyzeTransaction(transactionId, 999_999, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const pepAlert = calls.find((c: any) => c[0].data.alertType === 'PEP');
      expect(pepAlert).toBeUndefined();
    });

    it('should detect CASH_SUSPECT for large DEPOSIT >= 2M', async () => {
      await service.analyzeTransaction(transactionId, 2_000_000, clientId, 'DEPOSIT');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const cashAlert = calls.find((c: any) => c[0].data.alertType === 'CASH_SUSPECT');
      expect(cashAlert).toBeDefined();
      expect(cashAlert[0].data.riskLevel).toBe('MEDIUM');
    });

    it('should detect CASH_SUSPECT for large WITHDRAWAL >= 2M', async () => {
      await service.analyzeTransaction(transactionId, 3_000_000, clientId, 'WITHDRAWAL');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const cashAlert = calls.find((c: any) => c[0].data.alertType === 'CASH_SUSPECT');
      expect(cashAlert).toBeDefined();
    });

    it('should NOT trigger CASH_SUSPECT for TRANSFER type', async () => {
      await service.analyzeTransaction(transactionId, 3_000_000, clientId, 'TRANSFER');

      const calls = mockPrismaService.amlAlert.create.mock.calls;
      const cashAlert = calls.find((c: any) => c[0].data.alertType === 'CASH_SUSPECT');
      expect(cashAlert).toBeUndefined();
    });

    it('should return the number of alerts created', async () => {
      // Amount >= 5M triggers SEUIL_DECLARATION; DEPOSIT >= 2M triggers CASH_SUSPECT
      const count = await service.analyzeTransaction(transactionId, 6_000_000, clientId, 'DEPOSIT');
      expect(count).toBe(2); // SEUIL_DECLARATION + CASH_SUSPECT
    });

    it('should return 0 when no alerts triggered', async () => {
      const count = await service.analyzeTransaction(transactionId, 100_000, clientId, 'TRANSFER');
      expect(count).toBe(0);
      expect(mockPrismaService.amlAlert.create).not.toHaveBeenCalled();
    });

    it('should trigger multiple alerts simultaneously', async () => {
      // PEP client, large deposit >= 5M => SEUIL_DECLARATION + PEP + CASH_SUSPECT
      mockPrismaService.client.findUnique.mockResolvedValue({
        isPEP: true,
        firstName: 'Paul',
        lastName: 'Biya',
        raisonSociale: null,
      });

      const count = await service.analyzeTransaction(transactionId, 5_000_000, clientId, 'DEPOSIT');
      expect(count).toBe(3);
    });
  });

  // ────────────────────────────────────────────────────────
  // findAll
  // ────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated alerts', async () => {
      const mockData = [{ id: 'alert-1' }, { id: 'alert-2' }];
      mockPrismaService.amlAlert.findMany.mockResolvedValue(mockData);
      mockPrismaService.amlAlert.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ data: mockData, total: 2, page: 1, limit: 20, totalPages: 1 });
    });

    it('should apply filters', async () => {
      mockPrismaService.amlAlert.findMany.mockResolvedValue([]);
      mockPrismaService.amlAlert.count.mockResolvedValue(0);

      await service.findAll({ status: 'OPEN', riskLevel: 'HIGH', alertType: 'PEP', clientId: 'c1' });

      expect(mockPrismaService.amlAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'OPEN', riskLevel: 'HIGH', alertType: 'PEP', clientId: 'c1' },
        }),
      );
    });

    it('should paginate correctly', async () => {
      mockPrismaService.amlAlert.findMany.mockResolvedValue([]);
      mockPrismaService.amlAlert.count.mockResolvedValue(50);

      const result = await service.findAll({ page: 3, limit: 10 });

      expect(mockPrismaService.amlAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.totalPages).toBe(5);
    });

    it('should use default page and limit', async () => {
      mockPrismaService.amlAlert.findMany.mockResolvedValue([]);
      mockPrismaService.amlAlert.count.mockResolvedValue(0);

      await service.findAll({});

      expect(mockPrismaService.amlAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });

  // ────────────────────────────────────────────────────────
  // findOne
  // ────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return alert by id', async () => {
      const mockAlert = { id: 'alert-1', reference: 'AML-XYZ' };
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(mockAlert);

      const result = await service.findOne('alert-1');
      expect(result).toEqual(mockAlert);
    });

    it('should throw NotFoundException if alert not found', async () => {
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────
  // updateStatus
  // ────────────────────────────────────────────────────────
  describe('updateStatus', () => {
    const userId = 'user-1';

    it('should update alert status', async () => {
      const existing = { id: 'alert-1', reference: 'AML-001' };
      const updated = { ...existing, status: 'INVESTIGATING' };
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(existing);
      mockPrismaService.amlAlert.update.mockResolvedValue(updated);

      const result = await service.updateStatus('alert-1', { status: 'INVESTIGATING' }, userId);

      expect(result).toEqual(updated);
      expect(mockPrismaService.amlAlert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { status: 'INVESTIGATING' },
      });
    });

    it('should update with investigation notes and resolution', async () => {
      const existing = { id: 'alert-1', reference: 'AML-001' };
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(existing);
      mockPrismaService.amlAlert.update.mockResolvedValue({ ...existing, status: 'CLOSED' });

      await service.updateStatus('alert-1', {
        status: 'CLOSED',
        investigationNotes: 'Faux positif',
        resolution: 'Cloture sans suite',
        assignedToId: 'user-2',
      }, userId);

      expect(mockPrismaService.amlAlert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: {
          status: 'CLOSED',
          investigationNotes: 'Faux positif',
          resolution: 'Cloture sans suite',
          assignedToId: 'user-2',
        },
      });
    });

    it('should throw NotFoundException if alert not found', async () => {
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('nonexistent', { status: 'CLOSED' }, userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should log to audit service', async () => {
      const existing = { id: 'alert-1', reference: 'AML-001' };
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(existing);
      mockPrismaService.amlAlert.update.mockResolvedValue({ ...existing, status: 'INVESTIGATING' });

      await service.updateStatus('alert-1', { status: 'INVESTIGATING' }, userId);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'UPDATE',
          module: 'AML',
          entityId: 'alert-1',
          entityType: 'AmlAlert',
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────
  // reportToAuthority (ANIF)
  // ────────────────────────────────────────────────────────
  describe('reportToAuthority', () => {
    const userId = 'user-1';

    it('should report alert to ANIF', async () => {
      const existing = { id: 'alert-1', reference: 'AML-001', reportedToAuthority: false };
      const updated = { ...existing, reportedToAuthority: true, status: 'REPORTED' };
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(existing);
      mockPrismaService.amlAlert.update.mockResolvedValue(updated);

      const result = await service.reportToAuthority('alert-1', userId);

      expect(result).toEqual(updated);
      expect(mockPrismaService.amlAlert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: expect.objectContaining({
          reportedToAuthority: true,
          status: 'REPORTED',
        }),
      });
    });

    it('should throw NotFoundException if alert not found', async () => {
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(null);

      await expect(service.reportToAuthority('nonexistent', userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already reported', async () => {
      mockPrismaService.amlAlert.findUnique.mockResolvedValue({
        id: 'alert-1',
        reference: 'AML-001',
        reportedToAuthority: true,
      });

      await expect(service.reportToAuthority('alert-1', userId))
        .rejects.toThrow(BadRequestException);
    });

    it('should log to audit service after reporting', async () => {
      const existing = { id: 'alert-1', reference: 'AML-001', reportedToAuthority: false };
      mockPrismaService.amlAlert.findUnique.mockResolvedValue(existing);
      mockPrismaService.amlAlert.update.mockResolvedValue({ ...existing, reportedToAuthority: true });

      await service.reportToAuthority('alert-1', userId);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'UPDATE',
          module: 'AML',
          details: expect.stringContaining('ANIF'),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────
  // getStats
  // ────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('should return statistics', async () => {
      mockPrismaService.amlAlert.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(50)  // open
        .mockResolvedValueOnce(20)  // investigating
        .mockResolvedValueOnce(10)  // escalated
        .mockResolvedValueOnce(5);  // reported

      mockPrismaService.amlAlert.groupBy
        .mockResolvedValueOnce([
          { riskLevel: 'HIGH', _count: 60 },
          { riskLevel: 'MEDIUM', _count: 40 },
        ])
        .mockResolvedValueOnce([
          { alertType: 'SEUIL_DECLARATION', _count: 30 },
          { alertType: 'FRACTIONNEMENT', _count: 20 },
          { alertType: 'PEP', _count: 50 },
        ]);

      const result = await service.getStats();

      expect(result).toEqual({
        total: 100,
        open: 50,
        investigating: 20,
        escalated: 10,
        reported: 5,
        byRisk: { HIGH: 60, MEDIUM: 40 },
        byType: { SEUIL_DECLARATION: 30, FRACTIONNEMENT: 20, PEP: 50 },
      });
    });
  });
});
