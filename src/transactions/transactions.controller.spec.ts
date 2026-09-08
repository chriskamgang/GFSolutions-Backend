import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockService = () => ({
  deposit: jest.fn(),
  withdrawal: jest.fn(),
  transfer: jest.fn(),
  getSignataires: jest.fn(),
  createExternalTransfer: jest.fn(),
  approveExternalTransfer: jest.fn(),
  getPendingExternalTransfers: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  createFeeConfig: jest.fn(),
  findAllFeeConfigs: jest.fn(),
  updateFeeConfig: jest.fn(),
  generateReceipt: jest.fn(),
});

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: ReturnType<typeof mockService>;

  beforeEach(async () => {
    service = mockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: service },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get(TransactionsController);
  });

  const user = { sub: 'user-1' };

  // ==================== deposit ====================
  describe('deposit', () => {
    it('should call service.deposit with dto and user.sub', async () => {
      const dto = { toAccountId: 'acc-1', amount: 50000, agencyId: 'ag-1' } as any;
      service.deposit.mockResolvedValue({ id: 'txn-1', status: 'COMPLETED' });

      const result = await controller.deposit(dto, user);
      expect(service.deposit).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.status).toBe('COMPLETED');
    });
  });

  // ==================== withdrawal ====================
  describe('withdrawal', () => {
    it('should call service.withdrawal with dto and user.sub', async () => {
      const dto = { fromAccountId: 'acc-1', amount: 20000, agencyId: 'ag-1' } as any;
      service.withdrawal.mockResolvedValue({ id: 'txn-2', status: 'COMPLETED' });

      const result = await controller.withdrawal(dto, user);
      expect(service.withdrawal).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.status).toBe('COMPLETED');
    });
  });

  // ==================== transfer ====================
  describe('transfer', () => {
    it('should call service.transfer with dto and user.sub', async () => {
      const dto = { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 10000, agencyId: 'ag-1' } as any;
      service.transfer.mockResolvedValue({ id: 'txn-3', status: 'COMPLETED' });

      const result = await controller.transfer(dto, user);
      expect(service.transfer).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.status).toBe('COMPLETED');
    });
  });

  // ==================== getSignataires ====================
  describe('getSignataires', () => {
    it('should call service.getSignataires with accountId', async () => {
      service.getSignataires.mockResolvedValue({ isMorale: false, signataires: [] });

      const result = await controller.getSignataires('acc-1');
      expect(service.getSignataires).toHaveBeenCalledWith('acc-1');
      expect(result.isMorale).toBe(false);
    });
  });

  // ==================== createExternalTransfer ====================
  describe('createExternalTransfer', () => {
    it('should call service with dto and user.sub', async () => {
      const dto = {
        fromAccountId: 'acc-1',
        amount: 100000,
        destinationBank: 'Afriland',
        destinationAccountNumber: '123',
        beneficiaryName: 'Jean',
        agencyId: 'ag-1',
      } as any;
      service.createExternalTransfer.mockResolvedValue({ id: 'txn-4', status: 'PENDING' });

      const result = await controller.createExternalTransfer(dto, user);
      expect(service.createExternalTransfer).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.status).toBe('PENDING');
    });
  });

  // ==================== approveExternalTransfer ====================
  describe('approveExternalTransfer', () => {
    it('should call service.approveExternalTransfer with id, dto, user.sub', async () => {
      const dto = { approved: true } as any;
      service.approveExternalTransfer.mockResolvedValue({ status: 'COMPLETED' });

      const result = await controller.approveExternalTransfer('txn-4', dto, user);
      expect(service.approveExternalTransfer).toHaveBeenCalledWith('txn-4', dto, 'user-1');
      expect(result.status).toBe('COMPLETED');
    });
  });

  // ==================== getPendingExternalTransfers ====================
  describe('getPendingExternalTransfers', () => {
    it('should call service with optional agencyId', async () => {
      service.getPendingExternalTransfers.mockResolvedValue([]);
      const result = await controller.getPendingExternalTransfers('ag-1');
      expect(service.getPendingExternalTransfers).toHaveBeenCalledWith('ag-1');
      expect(result).toEqual([]);
    });

    it('should call service without agencyId', async () => {
      service.getPendingExternalTransfers.mockResolvedValue([{ id: 'txn-5' }]);
      const result = await controller.getPendingExternalTransfers(undefined);
      expect(service.getPendingExternalTransfers).toHaveBeenCalledWith(undefined);
      expect(result).toHaveLength(1);
    });
  });

  // ==================== findAll ====================
  describe('findAll', () => {
    it('should pass parsed params to service.findAll', async () => {
      service.findAll.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });

      const result = await controller.findAll('ag-1', 'acc-1', 'DEPOSIT', '2024-01-01', '2024-12-31', '2', '10', 'true');
      expect(service.findAll).toHaveBeenCalledWith({
        agencyId: 'ag-1',
        accountId: 'acc-1',
        type: 'DEPOSIT',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        page: 2,
        limit: 10,
        isTest: true,
      });
      expect(result.meta.total).toBe(0);
    });

    it('should handle default pagination', async () => {
      service.findAll.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });

      await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
      expect(service.findAll).toHaveBeenCalledWith({
        agencyId: undefined,
        accountId: undefined,
        type: undefined,
        startDate: undefined,
        endDate: undefined,
        page: 1,
        limit: 20,
        isTest: undefined,
      });
    });

    it('should parse isTest=false correctly', async () => {
      service.findAll.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });

      await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'false');
      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isTest: false }),
      );
    });
  });

  // ==================== findOne (via :id) ====================
  describe('findOne', () => {
    it('should call service.findOne', async () => {
      service.findOne.mockResolvedValue({ id: 'txn-1' });
      const result = await controller.findOne('txn-1');
      expect(service.findOne).toHaveBeenCalledWith('txn-1');
      expect(result.id).toBe('txn-1');
    });
  });

  // ==================== Fee Config ====================
  describe('Fee Config endpoints', () => {
    it('createFeeConfig should delegate to service', async () => {
      const body = { name: 'Test', transactionType: 'DEPOSIT', feeValue: 1.5 };
      service.createFeeConfig.mockResolvedValue({ id: 'fc-1', ...body });

      const result = await controller.createFeeConfig(body);
      expect(service.createFeeConfig).toHaveBeenCalledWith(body);
      expect(result.name).toBe('Test');
    });

    it('findAllFeeConfigs should delegate to service', async () => {
      service.findAllFeeConfigs.mockResolvedValue([{ id: 'fc-1' }]);
      const result = await controller.findAllFeeConfigs();
      expect(result).toHaveLength(1);
    });

    it('updateFeeConfig should delegate to service', async () => {
      const body = { feeValue: 2 };
      service.updateFeeConfig.mockResolvedValue({ id: 'fc-1', feeValue: 2 });

      const result = await controller.updateFeeConfig('fc-1', body);
      expect(service.updateFeeConfig).toHaveBeenCalledWith('fc-1', body);
      expect(result.feeValue).toBe(2);
    });
  });

  // ==================== Receipt ====================
  describe('getReceipt', () => {
    it('should call service.generateReceipt', async () => {
      service.generateReceipt.mockResolvedValue({ receiptNumber: 'TXN-123', amount: 50000 });
      const result = await controller.getReceipt('txn-1');
      expect(service.generateReceipt).toHaveBeenCalledWith('txn-1');
      expect(result.receiptNumber).toBe('TXN-123');
    });
  });
});
