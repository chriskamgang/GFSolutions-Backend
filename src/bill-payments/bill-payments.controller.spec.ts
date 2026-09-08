import { Test, TestingModule } from '@nestjs/testing';
import { BillPaymentsController } from './bill-payments.controller';
import { BillPaymentsService, OPERATORS } from './bill-payments.service';

describe('BillPaymentsController', () => {
  let controller: BillPaymentsController;
  let service: jest.Mocked<BillPaymentsService>;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getReversalStats: jest.fn(),
    markReversed: jest.fn(),
    cancel: jest.fn(),
    getKpis: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillPaymentsController],
      providers: [
        { provide: BillPaymentsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<BillPaymentsController>(BillPaymentsController);
    service = module.get(BillPaymentsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== getOperators() ====================

  describe('getOperators', () => {
    it('should return all operators as key-label pairs', () => {
      const result = controller.getOperators();

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(Object.keys(OPERATORS).length);
      expect(result[0]).toHaveProperty('key');
      expect(result[0]).toHaveProperty('label');
      expect(result.find((o) => o.key === 'ENEO')).toBeDefined();
    });
  });

  // ==================== getKpis() ====================

  describe('getKpis', () => {
    it('should delegate to service.getKpis without agencyId', async () => {
      const kpis = { totalCount: 100, totalAmount: 5000000, todayCount: 5 };
      mockService.getKpis.mockResolvedValue(kpis);

      const result = await controller.getKpis();

      expect(result).toEqual(kpis);
      expect(mockService.getKpis).toHaveBeenCalledWith(undefined);
    });

    it('should delegate to service.getKpis with agencyId', async () => {
      mockService.getKpis.mockResolvedValue({});

      await controller.getKpis('agency-1');

      expect(mockService.getKpis).toHaveBeenCalledWith('agency-1');
    });
  });

  // ==================== getReversalStats() ====================

  describe('getReversalStats', () => {
    it('should delegate to service with all filters', async () => {
      mockService.getReversalStats.mockResolvedValue([]);

      await controller.getReversalStats('agency-1', '2026-01-01', '2026-01-31');

      expect(mockService.getReversalStats).toHaveBeenCalledWith('agency-1', '2026-01-01', '2026-01-31');
    });

    it('should work without filters', async () => {
      mockService.getReversalStats.mockResolvedValue([]);

      await controller.getReversalStats();

      expect(mockService.getReversalStats).toHaveBeenCalledWith(undefined, undefined, undefined);
    });
  });

  // ==================== create() ====================

  describe('create', () => {
    it('should delegate to service.create with userId and dto', async () => {
      const dto = {
        operator: 'ENEO',
        billNumber: 'FAC-123',
        payerName: 'Jean',
        amount: 50000,
        paymentMode: 'CASH' as const,
        agencyId: 'agency-1',
      };
      const created = { id: 'pay-1', ...dto };
      mockService.create.mockResolvedValue(created);

      const result = await controller.create('user-1', dto);

      expect(result).toEqual(created);
      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
    });
  });

  // ==================== findAll() ====================

  describe('findAll', () => {
    it('should parse page and limit from strings and delegate to service', async () => {
      mockService.findAll.mockResolvedValue({ data: [], total: 0, page: 2, limit: 10 });

      const result = await controller.findAll('2', '10', 'agency-1', 'ENEO', 'COLLECTED', '2026-01-01', '2026-01-31', 'Jean');

      expect(mockService.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        agencyId: 'agency-1',
        operator: 'ENEO',
        status: 'COLLECTED',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        search: 'Jean',
      });
    });

    it('should pass undefined page/limit when not provided', async () => {
      mockService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        agencyId: undefined,
        operator: undefined,
        status: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        search: undefined,
      });
    });
  });

  // ==================== findOne() ====================

  describe('findOne', () => {
    it('should delegate to service.findOne', async () => {
      const payment = { id: 'pay-1', reference: 'FAC-123' };
      mockService.findOne.mockResolvedValue(payment);

      const result = await controller.findOne('pay-1');

      expect(result).toEqual(payment);
      expect(mockService.findOne).toHaveBeenCalledWith('pay-1');
    });
  });

  // ==================== markReversed() ====================

  describe('markReversed', () => {
    it('should delegate to service.markReversed', async () => {
      const response = { success: true, count: 5, message: '5 paiements marques' };
      mockService.markReversed.mockResolvedValue(response);

      const result = await controller.markReversed('user-1', { operator: 'ENEO', agencyId: 'agency-1' });

      expect(result).toEqual(response);
      expect(mockService.markReversed).toHaveBeenCalledWith('user-1', 'ENEO', 'agency-1');
    });
  });

  // ==================== cancel() ====================

  describe('cancel', () => {
    it('should delegate to service.cancel', async () => {
      const cancelled = { id: 'pay-1', status: 'CANCELLED' };
      mockService.cancel.mockResolvedValue(cancelled);

      const result = await controller.cancel('pay-1', 'user-1');

      expect(result).toEqual(cancelled);
      expect(mockService.cancel).toHaveBeenCalledWith('pay-1', 'user-1');
    });
  });
});
