import { Test, TestingModule } from '@nestjs/testing';
import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TreasuryController', () => {
  let controller: TreasuryController;

  const mockService = {
    getConsolidatedPosition: jest.fn(),
    getPositionByAgency: jest.fn(),
    getTrend: jest.fn(),
    createVault: jest.fn(),
    getVaults: jest.fn(),
    getVaultByAgency: jest.fn(),
    requestDepositToVault: jest.fn(),
    requestWithdrawalFromVault: jest.fn(),
    getPendingMovements: jest.fn(),
    approveVaultMovement: jest.fn(),
    getVaultMovements: jest.fn(),
    setCashCeiling: jest.fn(),
    getCashCeilingStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TreasuryController],
      providers: [
        { provide: TreasuryService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<TreasuryController>(TreasuryController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPosition', () => {
    it('should call getConsolidatedPosition with agencyId', async () => {
      mockService.getConsolidatedPosition.mockResolvedValue({ caissePrincipale: 100000 });

      const result = await controller.getPosition('a1');

      expect(result).toEqual({ caissePrincipale: 100000 });
      expect(mockService.getConsolidatedPosition).toHaveBeenCalledWith('a1');
    });

    it('should call getConsolidatedPosition without agencyId', async () => {
      mockService.getConsolidatedPosition.mockResolvedValue({});

      await controller.getPosition(undefined);

      expect(mockService.getConsolidatedPosition).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getByAgency', () => {
    it('should call getPositionByAgency', async () => {
      mockService.getPositionByAgency.mockResolvedValue([]);

      const result = await controller.getByAgency();

      expect(result).toEqual([]);
      expect(mockService.getPositionByAgency).toHaveBeenCalled();
    });
  });

  describe('getTrend', () => {
    it('should call getTrend', async () => {
      mockService.getTrend.mockResolvedValue([{ date: '2026-07-01', depots: 100, retraits: 50 }]);

      const result = await controller.getTrend();

      expect(result).toHaveLength(1);
      expect(mockService.getTrend).toHaveBeenCalled();
    });
  });

  describe('createVault', () => {
    it('should call createVault with dto values', async () => {
      const dto = { agencyId: 'a1', initialBalance: 500000 };
      mockService.createVault.mockResolvedValue({ id: 'v1' });

      const result = await controller.createVault(dto as any);

      expect(result).toEqual({ id: 'v1' });
      expect(mockService.createVault).toHaveBeenCalledWith('a1', 500000);
    });
  });

  describe('getVaults', () => {
    it('should call getVaults', async () => {
      mockService.getVaults.mockResolvedValue([]);

      const result = await controller.getVaults();

      expect(result).toEqual([]);
    });
  });

  describe('getVaultByAgency', () => {
    it('should call getVaultByAgency with agencyId', async () => {
      mockService.getVaultByAgency.mockResolvedValue({ id: 'v1' });

      const result = await controller.getVaultByAgency('a1');

      expect(result).toEqual({ id: 'v1' });
      expect(mockService.getVaultByAgency).toHaveBeenCalledWith('a1');
    });
  });

  describe('requestDeposit', () => {
    it('should call requestDepositToVault with dto and user.sub', async () => {
      const dto = { vaultId: 'v1', cashRegisterId: 'cr-1', amount: 100000, notes: 'test' };
      const user = { sub: 'user-1' };
      mockService.requestDepositToVault.mockResolvedValue({ id: 'mv-1' });

      const result = await controller.requestDeposit(dto as any, user);

      expect(result).toEqual({ id: 'mv-1' });
      expect(mockService.requestDepositToVault).toHaveBeenCalledWith('v1', 'cr-1', 100000, 'user-1', 'test');
    });
  });

  describe('requestWithdrawal', () => {
    it('should call requestWithdrawalFromVault with dto and user.sub', async () => {
      const dto = { vaultId: 'v1', cashRegisterId: 'cr-1', amount: 200000 };
      const user = { sub: 'user-2' };
      mockService.requestWithdrawalFromVault.mockResolvedValue({ id: 'mv-2' });

      const result = await controller.requestWithdrawal(dto as any, user);

      expect(result).toEqual({ id: 'mv-2' });
      expect(mockService.requestWithdrawalFromVault).toHaveBeenCalledWith('v1', 'cr-1', 200000, 'user-2', undefined);
    });
  });

  describe('getPendingMovements', () => {
    it('should call getPendingMovements with agencyId', async () => {
      mockService.getPendingMovements.mockResolvedValue([]);

      await controller.getPendingMovements('a1');

      expect(mockService.getPendingMovements).toHaveBeenCalledWith('a1');
    });
  });

  describe('approveMovement', () => {
    it('should call approveVaultMovement with id, dto.approved, user.sub, dto.comment', async () => {
      const dto = { approved: true, comment: 'OK' };
      const user = { sub: 'approver-1' };
      mockService.approveVaultMovement.mockResolvedValue({ id: 'mv-1', status: 'APPROVED' });

      const result = await controller.approveMovement('mv-1', dto as any, user);

      expect(result.status).toBe('APPROVED');
      expect(mockService.approveVaultMovement).toHaveBeenCalledWith('mv-1', true, 'approver-1', 'OK');
    });
  });

  describe('getMovements', () => {
    it('should call getVaultMovements with parsed params', async () => {
      mockService.getVaultMovements.mockResolvedValue({ data: [], total: 0 });

      await controller.getMovements('v1', 'a1', 'PENDING', '2', '10');

      expect(mockService.getVaultMovements).toHaveBeenCalledWith({
        vaultId: 'v1', agencyId: 'a1', status: 'PENDING', page: 2, limit: 10,
      });
    });

    it('should default page to 1 and limit to 20 when not provided', async () => {
      mockService.getVaultMovements.mockResolvedValue({ data: [], total: 0 });

      await controller.getMovements(undefined, undefined, undefined, undefined, undefined);

      expect(mockService.getVaultMovements).toHaveBeenCalledWith({
        vaultId: undefined, agencyId: undefined, status: undefined, page: 1, limit: 20,
      });
    });
  });

  describe('setCeiling', () => {
    it('should call setCashCeiling with id, dto.cashCeiling, user.sub', async () => {
      const dto = { cashCeiling: 1000000 };
      const user = { sub: 'admin-1' };
      mockService.setCashCeiling.mockResolvedValue({ id: 'cr-1', cashCeiling: 1000000 });

      const result = await controller.setCeiling('cr-1', dto as any, user);

      expect(result.cashCeiling).toBe(1000000);
      expect(mockService.setCashCeiling).toHaveBeenCalledWith('cr-1', 1000000, 'admin-1');
    });
  });

  describe('getCeilingStatus', () => {
    it('should call getCashCeilingStatus with user.sub', async () => {
      const user = { sub: 'caissier-1' };
      mockService.getCashCeilingStatus.mockResolvedValue({ hasOpenRegister: true, currentBalance: 500000 });

      const result = await controller.getCeilingStatus(user);

      expect(result.hasOpenRegister).toBe(true);
      expect(mockService.getCashCeilingStatus).toHaveBeenCalledWith('caissier-1');
    });
  });
});
