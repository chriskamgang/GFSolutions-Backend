import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillPaymentsService, OPERATORS } from './bill-payments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BillPaymentsService', () => {
  let service: BillPaymentsService;
  let prisma: Record<string, any>;

  const mockPrisma = {
    account: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    billPayment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillPaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BillPaymentsService>(BillPaymentsService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== create() ====================

  describe('create', () => {
    const baseCashDto = {
      operator: 'ENEO',
      billNumber: 'FAC-123',
      payerName: 'Jean Dupont',
      payerPhone: '690000000',
      amount: 50000,
      fees: 500,
      paymentMode: 'CASH' as const,
      agencyId: 'agency-1',
      notes: 'Paiement mensuel',
    };

    const baseAccountDto = {
      ...baseCashDto,
      paymentMode: 'ACCOUNT' as const,
      accountId: 'account-1',
    };

    const createdPayment = {
      id: 'pay-1',
      reference: 'FAC-1234567890-ABCD',
      ...baseCashDto,
      status: 'COLLECTED',
      collectedById: 'user-1',
      collectedBy: { firstName: 'Admin', lastName: 'User' },
      agency: { name: 'Agence Douala' },
      account: null,
    };

    it('should create a bill payment in CASH mode', async () => {
      mockPrisma.billPayment.create.mockResolvedValue(createdPayment);

      const result = await service.create('user-1', baseCashDto);

      expect(result).toEqual(createdPayment);
      expect(mockPrisma.billPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operator: 'ENEO',
            billNumber: 'FAC-123',
            payerName: 'Jean Dupont',
            amount: 50000,
            fees: 500,
            paymentMode: 'CASH',
            accountId: null,
            agencyId: 'agency-1',
            collectedById: 'user-1',
            status: 'COLLECTED',
          }),
        }),
      );
      // Should NOT touch account in CASH mode
      expect(mockPrisma.account.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    });

    it('should create a bill payment in ACCOUNT mode and debit account', async () => {
      const mockAccount = { id: 'account-1', status: 'ACTIVE', balance: 100000 };
      mockPrisma.account.findFirst.mockResolvedValue(mockAccount);
      mockPrisma.account.update.mockResolvedValue({ ...mockAccount, balance: 49500 });
      mockPrisma.billPayment.create.mockResolvedValue({
        ...createdPayment,
        paymentMode: 'ACCOUNT',
        accountId: 'account-1',
        account: { accountNumber: 'ACC-001' },
      });

      const result = await service.create('user-1', baseAccountDto);

      expect(result.paymentMode).toBe('ACCOUNT');
      expect(mockPrisma.account.findFirst).toHaveBeenCalledWith({
        where: { id: 'account-1', status: 'ACTIVE' },
      });
      // Should decrement by amount + fees = 50000 + 500 = 50500
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { balance: { decrement: 50500 } },
      });
    });

    it('should throw BadRequestException for invalid amount', async () => {
      await expect(service.create('user-1', { ...baseCashDto, amount: 0 }))
        .rejects.toThrow(BadRequestException);
      await expect(service.create('user-1', { ...baseCashDto, amount: -100 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unknown operator', async () => {
      await expect(service.create('user-1', { ...baseCashDto, operator: 'UNKNOWN' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when ACCOUNT mode without accountId', async () => {
      const dto = { ...baseAccountDto, accountId: undefined };
      await expect(service.create('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when account not found in ACCOUNT mode', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);
      await expect(service.create('user-1', baseAccountDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when insufficient balance in ACCOUNT mode', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'account-1',
        status: 'ACTIVE',
        balance: 1000, // less than 50000 + 500
      });
      await expect(service.create('user-1', baseAccountDto))
        .rejects.toThrow(BadRequestException);
    });

    it('should default fees to 0 when not provided', async () => {
      const dto = { ...baseCashDto, fees: undefined };
      mockPrisma.billPayment.create.mockResolvedValue(createdPayment);

      await service.create('user-1', dto);

      expect(mockPrisma.billPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fees: 0 }),
        }),
      );
    });

    it('should generate a reference starting with FAC-', async () => {
      mockPrisma.billPayment.create.mockResolvedValue(createdPayment);

      await service.create('user-1', baseCashDto);

      const callData = mockPrisma.billPayment.create.mock.calls[0][0].data;
      expect(callData.reference).toMatch(/^FAC-/);
    });
  });

  // ==================== findAll() ====================

  describe('findAll', () => {
    const mockPayments = [
      { id: 'pay-1', payerName: 'Jean', amount: 50000 },
      { id: 'pay-2', payerName: 'Marie', amount: 30000 },
    ];

    it('should return paginated list with defaults', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue(mockPayments);
      mockPrisma.billPayment.count.mockResolvedValue(2);

      const result = await service.findAll({});

      expect(result).toEqual({ data: mockPayments, total: 2, page: 1, limit: 20 });
      expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('should apply pagination correctly', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);
      mockPrisma.billPayment.count.mockResolvedValue(50);

      const result = await service.findAll({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should filter by agencyId', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);
      mockPrisma.billPayment.count.mockResolvedValue(0);

      await service.findAll({ agencyId: 'agency-1' });

      expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agencyId: 'agency-1' }),
        }),
      );
    });

    it('should filter by operator', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);
      mockPrisma.billPayment.count.mockResolvedValue(0);

      await service.findAll({ operator: 'ENEO' });

      expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ operator: 'ENEO' }),
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);
      mockPrisma.billPayment.count.mockResolvedValue(0);

      await service.findAll({ status: 'COLLECTED' });

      expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'COLLECTED' }),
        }),
      );
    });

    it('should apply search filter on payerName, billNumber, reference, payerPhone', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);
      mockPrisma.billPayment.count.mockResolvedValue(0);

      await service.findAll({ search: 'Jean' });

      const callArgs = mockPrisma.billPayment.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toEqual([
        { payerName: { contains: 'Jean' } },
        { billNumber: { contains: 'Jean' } },
        { reference: { contains: 'Jean' } },
        { payerPhone: { contains: 'Jean' } },
      ]);
    });

    it('should apply date range filters', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);
      mockPrisma.billPayment.count.mockResolvedValue(0);

      await service.findAll({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });

      const callArgs = mockPrisma.billPayment.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toEqual(new Date('2026-01-01'));
      expect(callArgs.where.createdAt.lte).toBeInstanceOf(Date);
    });
  });

  // ==================== findOne() ====================

  describe('findOne', () => {
    it('should return payment by id', async () => {
      const payment = { id: 'pay-1', reference: 'FAC-123', amount: 50000 };
      mockPrisma.billPayment.findUnique.mockResolvedValue(payment);

      const result = await service.findOne('pay-1');
      expect(result).toEqual(payment);
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.billPayment.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== getReversalStats() ====================

  describe('getReversalStats', () => {
    it('should return stats grouped by operator', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([
        { operator: 'ENEO', amount: 50000, fees: 500, id: '1' },
        { operator: 'ENEO', amount: 30000, fees: 300, id: '2' },
        { operator: 'CAMWATER', amount: 20000, fees: 200, id: '3' },
      ]);

      const result = await service.getReversalStats();

      expect(result).toHaveLength(2);
      const eneo = result.find((s) => s.operator === 'ENEO');
      expect(eneo).toBeDefined();
      expect(eneo!.count).toBe(2);
      expect(eneo!.totalAmount).toBe(80000);
      expect(eneo!.totalFees).toBe(800);
      expect(eneo!.toReverse).toBe(80000);
      expect(eneo!.label).toBe(OPERATORS.ENEO);
    });

    it('should filter by agencyId when provided', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);

      await service.getReversalStats('agency-1');

      expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agencyId: 'agency-1', status: 'COLLECTED' }),
        }),
      );
    });

    it('should apply date filters when provided', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);

      await service.getReversalStats(undefined, '2026-01-01', '2026-01-31');

      const callArgs = mockPrisma.billPayment.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toBeDefined();
    });

    it('should return empty array when no payments', async () => {
      mockPrisma.billPayment.findMany.mockResolvedValue([]);
      const result = await service.getReversalStats();
      expect(result).toEqual([]);
    });
  });

  // ==================== markReversed() ====================

  describe('markReversed', () => {
    it('should mark operator payments as reversed', async () => {
      mockPrisma.billPayment.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markReversed('user-1', 'ENEO');

      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
      expect(mockPrisma.billPayment.updateMany).toHaveBeenCalledWith({
        where: { operator: 'ENEO', status: 'COLLECTED' },
        data: expect.objectContaining({
          status: 'REVERSED',
          reversedById: 'user-1',
        }),
      });
    });

    it('should scope reversal to agency when agencyId provided', async () => {
      mockPrisma.billPayment.updateMany.mockResolvedValue({ count: 3 });

      await service.markReversed('user-1', 'CAMWATER', 'agency-1');

      expect(mockPrisma.billPayment.updateMany).toHaveBeenCalledWith({
        where: { operator: 'CAMWATER', status: 'COLLECTED', agencyId: 'agency-1' },
        data: expect.anything(),
      });
    });
  });

  // ==================== cancel() ====================

  describe('cancel', () => {
    it('should cancel a CASH payment without refunding account', async () => {
      const payment = {
        id: 'pay-1',
        status: 'COLLECTED',
        paymentMode: 'CASH',
        accountId: null,
        amount: 50000,
        fees: 500,
        account: null,
      };
      mockPrisma.billPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.billPayment.update.mockResolvedValue({
        ...payment,
        status: 'CANCELLED',
      });

      const result = await service.cancel('pay-1', 'user-1');

      expect(result.status).toBe('CANCELLED');
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    });

    it('should cancel an ACCOUNT payment and refund the account', async () => {
      const payment = {
        id: 'pay-1',
        status: 'COLLECTED',
        paymentMode: 'ACCOUNT',
        accountId: 'account-1',
        amount: 50000,
        fees: 500,
        account: { id: 'account-1' },
      };
      mockPrisma.billPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.account.update.mockResolvedValue({});
      mockPrisma.billPayment.update.mockResolvedValue({
        ...payment,
        status: 'CANCELLED',
      });

      await service.cancel('pay-1', 'user-1');

      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { balance: { increment: 50500 } }, // amount + fees
      });
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.billPayment.findUnique.mockResolvedValue(null);
      await expect(service.cancel('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when payment is not COLLECTED', async () => {
      const payment = { id: 'pay-1', status: 'REVERSED', paymentMode: 'CASH' };
      mockPrisma.billPayment.findUnique.mockResolvedValue(payment);
      await expect(service.cancel('pay-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== getKpis() ====================

  describe('getKpis', () => {
    it('should return KPI data', async () => {
      mockPrisma.billPayment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 1000000 }, _count: 50 })
        .mockResolvedValueOnce({ _sum: { amount: 200000 }, _count: 10 });
      mockPrisma.billPayment.count.mockResolvedValue(5);
      mockPrisma.billPayment.groupBy.mockResolvedValue([
        { operator: 'ENEO', _count: 30, _sum: { amount: 600000 } },
        { operator: 'CAMWATER', _count: 20, _sum: { amount: 400000 } },
      ]);

      const result = await service.getKpis();

      expect(result.totalCount).toBe(50);
      expect(result.totalAmount).toBe(1000000);
      expect(result.todayCount).toBe(5);
      expect(result.pendingReversal.count).toBe(10);
      expect(result.pendingReversal.amount).toBe(200000);
      expect(result.byOperator).toHaveLength(2);
      expect(result.byOperator[0].label).toBe(OPERATORS.ENEO);
    });

    it('should filter by agencyId when provided', async () => {
      mockPrisma.billPayment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 0 }, _count: 0 })
        .mockResolvedValueOnce({ _sum: { amount: 0 }, _count: 0 });
      mockPrisma.billPayment.count.mockResolvedValue(0);
      mockPrisma.billPayment.groupBy.mockResolvedValue([]);

      await service.getKpis('agency-1');

      expect(mockPrisma.billPayment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agencyId: 'agency-1' }),
        }),
      );
    });

    it('should handle null amounts gracefully', async () => {
      mockPrisma.billPayment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null }, _count: 0 })
        .mockResolvedValueOnce({ _sum: { amount: null }, _count: 0 });
      mockPrisma.billPayment.count.mockResolvedValue(0);
      mockPrisma.billPayment.groupBy.mockResolvedValue([]);

      const result = await service.getKpis();

      expect(result.totalAmount).toBe(0);
      expect(result.pendingReversal.amount).toBe(0);
    });
  });

  // ==================== OPERATORS constant ====================

  describe('OPERATORS', () => {
    it('should contain expected operators', () => {
      expect(OPERATORS).toHaveProperty('ENEO');
      expect(OPERATORS).toHaveProperty('CAMWATER');
      expect(OPERATORS).toHaveProperty('CANAL_PLUS');
      expect(OPERATORS).toHaveProperty('CAMTEL');
      expect(OPERATORS).toHaveProperty('DGI');
      expect(OPERATORS).toHaveProperty('SCHOOL');
      expect(OPERATORS).toHaveProperty('OTHER');
    });
  });
});
