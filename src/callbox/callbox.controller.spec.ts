import { Test, TestingModule } from '@nestjs/testing';
import { CallboxController } from './callbox.controller';
import { CallboxService } from './callbox.service';

describe('CallboxController', () => {
  let controller: CallboxController;
  let service: jest.Mocked<CallboxService>;

  const mockService = {
    register: jest.fn(),
    login: jest.fn(),
    getMe: jest.fn(),
    getStats: jest.fn(),
    getTransactions: jest.fn(),
    lookupByQrOrAccount: jest.fn(),
    deposit: jest.fn(),
    withdrawal: jest.fn(),
    transfer: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    suspend: jest.fn(),
    floatTopup: jest.fn(),
    getCommissionConfigs: jest.fn(),
    upsertCommissionConfig: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CallboxController],
      providers: [{ provide: CallboxService, useValue: mockService }],
    }).compile();

    controller = module.get<CallboxController>(CallboxController);
    service = module.get(CallboxService) as jest.Mocked<CallboxService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== AUTH ====================

  describe('register', () => {
    it('should call service.register with dto', async () => {
      const dto: any = { ownerName: 'Marie', phone: '+237699000001', email: 'marie@email.com', password: 'pass', city: 'Douala', agencyId: 'ag-1' };
      const expected = { id: 'cbx-1', callboxNumber: 'CBX-0001', status: 'PENDING' };
      mockService.register.mockResolvedValue(expected);

      const result = await controller.register(dto);
      expect(result).toEqual(expected);
      expect(mockService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('should call service.login with dto', async () => {
      const dto: any = { phone: '+237699000001', password: 'pass' };
      const expected = { access_token: 'jwt', expiresIn: 43200, callbox: {} };
      mockService.login.mockResolvedValue(expected);

      const result = await controller.login(dto);
      expect(result).toEqual(expected);
      expect(mockService.login).toHaveBeenCalledWith(dto);
    });
  });

  // ==================== CALLBOX OPERATIONS ====================

  describe('getMe', () => {
    it('should call service.getMe with callboxId from request', async () => {
      const req = { user: { callboxId: 'cbx-1' } };
      const expected = { id: 'cbx-1', ownerName: 'Marie' };
      mockService.getMe.mockResolvedValue(expected);

      const result = await controller.getMe(req);
      expect(result).toEqual(expected);
      expect(mockService.getMe).toHaveBeenCalledWith('cbx-1');
    });
  });

  describe('getStats', () => {
    it('should call service.getStats with callboxId', async () => {
      const req = { user: { callboxId: 'cbx-1' } };
      const expected = { float: 30000, today: {}, total: {} };
      mockService.getStats.mockResolvedValue(expected);

      const result = await controller.getStats(req);
      expect(result).toEqual(expected);
      expect(mockService.getStats).toHaveBeenCalledWith('cbx-1');
    });
  });

  describe('getTransactions', () => {
    it('should call service.getTransactions with pagination', async () => {
      const req = { user: { callboxId: 'cbx-1' } };
      const expected = { data: [], total: 0, page: 1, limit: 10 };
      mockService.getTransactions.mockResolvedValue(expected);

      const result = await controller.getTransactions(req, 1, 10);
      expect(result).toEqual(expected);
      expect(mockService.getTransactions).toHaveBeenCalledWith('cbx-1', { page: 1, limit: 10 });
    });
  });

  describe('lookup', () => {
    it('should call service.lookupByQrOrAccount', async () => {
      const expected = { clientId: 'cl-1', clientName: 'Jean Dupont' };
      mockService.lookupByQrOrAccount.mockResolvedValue(expected);

      const result = await controller.lookup('QR-123');
      expect(result).toEqual(expected);
      expect(mockService.lookupByQrOrAccount).toHaveBeenCalledWith('QR-123');
    });
  });

  describe('deposit', () => {
    it('should call service.deposit with callboxId and dto', async () => {
      const req = { user: { callboxId: 'cbx-1' } };
      const dto: any = { identifier: 'QR-123', amount: 10000 };
      const expected = { success: true, amount: 10000 };
      mockService.deposit.mockResolvedValue(expected);

      const result = await controller.deposit(req, dto);
      expect(result).toEqual(expected);
      expect(mockService.deposit).toHaveBeenCalledWith('cbx-1', dto);
    });
  });

  describe('withdrawal', () => {
    it('should call service.withdrawal with callboxId and dto', async () => {
      const req = { user: { callboxId: 'cbx-1' } };
      const dto: any = { identifier: 'ACC-001', amount: 5000 };
      const expected = { success: true, amount: 5000 };
      mockService.withdrawal.mockResolvedValue(expected);

      const result = await controller.withdrawal(req, dto);
      expect(result).toEqual(expected);
      expect(mockService.withdrawal).toHaveBeenCalledWith('cbx-1', dto);
    });
  });

  describe('transfer', () => {
    it('should call service.transfer with callboxId, agencyId and dto', async () => {
      const req = { user: { callboxId: 'cbx-1', agencyId: 'ag-1' } };
      const dto: any = { destIdentifier: 'QR-DEST', amount: 15000 };
      const expected = { success: true, amount: 15000 };
      mockService.transfer.mockResolvedValue(expected);

      const result = await controller.transfer(req, dto);
      expect(result).toEqual(expected);
      expect(mockService.transfer).toHaveBeenCalledWith('cbx-1', 'ag-1', dto);
    });
  });

  // ==================== ADMIN ====================

  describe('adminRegister', () => {
    it('should call service.register with dto and admin userId', async () => {
      const req = { user: { sub: 'admin-1' } };
      const dto: any = { ownerName: 'Marie', phone: '+237699000002', email: 'test@test.com', password: 'p', city: 'D', agencyId: 'ag' };
      const expected = { id: 'cbx-2', status: 'PENDING' };
      mockService.register.mockResolvedValue(expected);

      const result = await controller.adminRegister(dto, req);
      expect(result).toEqual(expected);
      expect(mockService.register).toHaveBeenCalledWith(dto, 'admin-1');
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with query params', async () => {
      const expected = { data: [], total: 0, page: 1, limit: 20 };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('APPROVED', 'ag-1', 1, 20);
      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalledWith({
        status: 'APPROVED',
        agencyId: 'ag-1',
        page: 1,
        limit: 20,
      });
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id', async () => {
      const expected = { id: 'cbx-1', ownerName: 'Marie' };
      mockService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('cbx-1');
      expect(result).toEqual(expected);
    });
  });

  describe('approve', () => {
    it('should call service.approve with id and admin sub', async () => {
      const req = { user: { sub: 'admin-1' } };
      const expected = { id: 'cbx-1', status: 'APPROVED' };
      mockService.approve.mockResolvedValue(expected);

      const result = await controller.approve('cbx-1', req);
      expect(result).toEqual(expected);
      expect(mockService.approve).toHaveBeenCalledWith('cbx-1', 'admin-1');
    });
  });

  describe('reject', () => {
    it('should call service.reject with id and admin sub', async () => {
      const req = { user: { sub: 'admin-1' } };
      const expected = { id: 'cbx-1', status: 'REJECTED' };
      mockService.reject.mockResolvedValue(expected);

      const result = await controller.reject('cbx-1', req);
      expect(result).toEqual(expected);
      expect(mockService.reject).toHaveBeenCalledWith('cbx-1', 'admin-1');
    });
  });

  describe('suspend', () => {
    it('should call service.suspend with id', async () => {
      const expected = { id: 'cbx-1', status: 'SUSPENDED' };
      mockService.suspend.mockResolvedValue(expected);

      const result = await controller.suspend('cbx-1');
      expect(result).toEqual(expected);
      expect(mockService.suspend).toHaveBeenCalledWith('cbx-1');
    });
  });

  describe('floatTopup', () => {
    it('should call service.floatTopup with dto and admin sub', async () => {
      const req = { user: { sub: 'admin-1' } };
      const dto: any = { callboxId: 'cbx-1', amount: 50000, method: 'CASH_AGENCY' };
      const expected = { success: true, newFloat: 80000 };
      mockService.floatTopup.mockResolvedValue(expected);

      const result = await controller.floatTopup(dto, req);
      expect(result).toEqual(expected);
      expect(mockService.floatTopup).toHaveBeenCalledWith(dto, 'admin-1');
    });
  });

  describe('getCommissionConfigs', () => {
    it('should call service.getCommissionConfigs', async () => {
      const expected = [{ transactionType: 'DEPOSIT', rate: 0.01 }];
      mockService.getCommissionConfigs.mockResolvedValue(expected);

      const result = await controller.getCommissionConfigs();
      expect(result).toEqual(expected);
    });
  });

  describe('upsertCommissionConfig', () => {
    it('should call service.upsertCommissionConfig with type and dto', async () => {
      const dto: any = { rate: 0.02, callboxShareRate: 0.5 };
      const expected = { transactionType: 'DEPOSIT', rate: 0.02, callboxShareRate: 0.5 };
      mockService.upsertCommissionConfig.mockResolvedValue(expected);

      const result = await controller.upsertCommissionConfig('DEPOSIT', dto);
      expect(result).toEqual(expected);
      expect(mockService.upsertCommissionConfig).toHaveBeenCalledWith('DEPOSIT', dto);
    });
  });
});
