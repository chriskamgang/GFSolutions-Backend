import { Test, TestingModule } from '@nestjs/testing';
import { TreasuryService } from './treasury.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

describe('TreasuryService', () => {
  let service: TreasuryService;

  const mockPrisma = {
    account: {
      aggregate: jest.fn(),
    },
    credit: {
      aggregate: jest.fn(),
    },
    cashRegister: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    transaction: {
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    agency: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    client: {
      count: jest.fn(),
    },
    vault: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vaultMovement: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreasuryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<TreasuryService>(TreasuryService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== CONSOLIDATED POSITION ====================

  describe('getConsolidatedPosition', () => {
    beforeEach(() => {
      // Setup default aggregation mocks
      mockPrisma.account.aggregate.mockResolvedValue({ _sum: { balance: 1000000 } });
      mockPrisma.credit.aggregate.mockResolvedValue({ _sum: { remainingAmount: 500000 } });
      mockPrisma.cashRegister.findMany.mockResolvedValue([
        { id: 'cr-1', openingBalance: 100000, totalDeposits: 200000, totalWithdrawals: 50000, agencyId: 'a1', userId: 'u1' },
      ]);
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 100000, fees: 5000 } });
      mockPrisma.transaction.count.mockResolvedValue(15);
    });

    it('should return consolidated position with all sections', async () => {
      const result = await service.getConsolidatedPosition();

      expect(result).toHaveProperty('caissePrincipale');
      expect(result).toHaveProperty('depotClients');
      expect(result).toHaveProperty('epargneClients');
      expect(result).toHaveProperty('datClients');
      expect(result).toHaveProperty('totalDepots');
      expect(result).toHaveProperty('creditsEncours');
      expect(result).toHaveProperty('soldeNet');
      expect(result).toHaveProperty('caisses');
      expect(result).toHaveProperty('today');
      expect(result).toHaveProperty('month');
    });

    it('should calculate caissePrincipale from cash registers', async () => {
      mockPrisma.cashRegister.findMany.mockResolvedValue([
        { id: 'cr-1', openingBalance: 100000, totalDeposits: 300000, totalWithdrawals: 50000 },
        { id: 'cr-2', openingBalance: 50000, totalDeposits: 100000, totalWithdrawals: 20000 },
      ]);

      const result = await service.getConsolidatedPosition();

      // cr-1: 100000 + 300000 - 50000 = 350000
      // cr-2: 50000 + 100000 - 20000 = 130000
      expect(result.caissePrincipale).toBe(480000);
    });

    it('should accept agencyId filter', async () => {
      await service.getConsolidatedPosition('agency-1');

      expect(mockPrisma.account.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agencyId: 'agency-1' }),
        }),
      );
    });

    it('should handle null aggregate values gracefully', async () => {
      mockPrisma.account.aggregate.mockResolvedValue({ _sum: { balance: null } });
      mockPrisma.credit.aggregate.mockResolvedValue({ _sum: { remainingAmount: null } });
      mockPrisma.cashRegister.findMany.mockResolvedValue([]);
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: null, fees: null } });
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await service.getConsolidatedPosition();

      expect(result.depotClients).toBe(0);
      expect(result.creditsEncours).toBe(0);
      expect(result.today.depots).toBe(0);
    });
  });

  // ==================== POSITION BY AGENCY ====================

  describe('getPositionByAgency', () => {
    it('should return positions for all active agencies', async () => {
      mockPrisma.agency.findMany.mockResolvedValue([
        { id: 'a1', name: 'Douala', code: 'DLA', city: 'Douala' },
        { id: 'a2', name: 'Yaounde', code: 'YDE', city: 'Yaounde' },
      ]);
      mockPrisma.account.aggregate.mockResolvedValue({ _sum: { balance: 500000 } });
      mockPrisma.cashRegister.findMany.mockResolvedValue([
        { openingBalance: 100000, totalDeposits: 200000, totalWithdrawals: 50000 },
      ]);
      mockPrisma.client.count.mockResolvedValue(42);

      const result = await service.getPositionByAgency();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('agencyId', 'a1');
      expect(result[0]).toHaveProperty('totalDepots', 500000);
      expect(result[0]).toHaveProperty('soldeCaisse', 250000);
      expect(result[0]).toHaveProperty('nbClients', 42);
    });

    it('should return empty array when no agencies exist', async () => {
      mockPrisma.agency.findMany.mockResolvedValue([]);

      const result = await service.getPositionByAgency();

      expect(result).toEqual([]);
    });
  });

  // ==================== TREND ====================

  describe('getTrend', () => {
    it('should return 30 days of deposit/withdrawal data', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 10000 } });

      const result = await service.getTrend();

      expect(result).toHaveLength(30);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('depots');
      expect(result[0]).toHaveProperty('retraits');
    });

    it('should return dates in YYYY-MM-DD format', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

      const result = await service.getTrend();

      expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ==================== VAULT (COFFRE-FORT) CRUD ====================

  describe('createVault', () => {
    it('should create a vault for an agency', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue(null);
      mockPrisma.agency.findUnique.mockResolvedValue({ id: 'a1', name: 'Douala' });
      mockPrisma.vault.create.mockResolvedValue({ id: 'v1', agencyId: 'a1', balance: 0, agency: { id: 'a1' } });

      const result = await service.createVault('a1');

      expect(result.agencyId).toBe('a1');
      expect(mockPrisma.vault.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { agencyId: 'a1', balance: 0 },
        }),
      );
    });

    it('should create a vault with initial balance', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue(null);
      mockPrisma.agency.findUnique.mockResolvedValue({ id: 'a1' });
      mockPrisma.vault.create.mockResolvedValue({ id: 'v1', balance: 500000 });

      await service.createVault('a1', 500000);

      expect(mockPrisma.vault.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { agencyId: 'a1', balance: 500000 },
        }),
      );
    });

    it('should throw BadRequestException if vault already exists for agency', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue({ id: 'v-existing' });

      await expect(service.createVault('a1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if agency does not exist', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue(null);
      mockPrisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.createVault('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getVaults', () => {
    it('should return all vaults with agency info and movement count', async () => {
      const vaults = [
        { id: 'v1', balance: 100000, agency: { id: 'a1', name: 'Douala', code: 'DLA', city: 'Douala' }, _count: { movements: 5 } },
      ];
      mockPrisma.vault.findMany.mockResolvedValue(vaults);

      const result = await service.getVaults();

      expect(result).toEqual(vaults);
      expect(mockPrisma.vault.findMany).toHaveBeenCalled();
    });
  });

  describe('getVaultByAgency', () => {
    it('should return a vault with recent movements', async () => {
      const vault = { id: 'v1', agencyId: 'a1', balance: 200000, movements: [], agency: {} };
      mockPrisma.vault.findUnique.mockResolvedValue(vault);

      const result = await service.getVaultByAgency('a1');

      expect(result).toEqual(vault);
    });

    it('should throw NotFoundException when vault does not exist', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue(null);

      await expect(service.getVaultByAgency('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== VAULT MOVEMENTS ====================

  describe('requestDepositToVault', () => {
    it('should create a deposit-to-vault movement', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue({ id: 'v1', agencyId: 'a1' });
      mockPrisma.cashRegister.findUnique.mockResolvedValue({
        id: 'cr-1', status: 'OPEN', openingBalance: 200000, totalDeposits: 300000, totalWithdrawals: 50000,
      });
      const movement = {
        id: 'mv-1', type: 'DEPOSIT_TO_VAULT', amount: 100000, status: 'PENDING',
        vault: { agency: { name: 'Douala' } },
        requestedBy: { firstName: 'Jean', lastName: 'Dupont' },
      };
      mockPrisma.vaultMovement.create.mockResolvedValue(movement);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.requestDepositToVault('v1', 'cr-1', 100000, 'user-1', 'Delestage fin de journee');

      expect(result.type).toBe('DEPOSIT_TO_VAULT');
      expect(mockPrisma.vaultMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vaultId: 'v1',
            cashRegisterId: 'cr-1',
            type: 'DEPOSIT_TO_VAULT',
            amount: 100000,
            requestedById: 'user-1',
          }),
        }),
      );
    });

    it('should throw NotFoundException when vault not found', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue(null);

      await expect(service.requestDepositToVault('v-bad', 'cr-1', 100000, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when cash register not found', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue({ id: 'v1' });
      mockPrisma.cashRegister.findUnique.mockResolvedValue(null);

      await expect(service.requestDepositToVault('v1', 'cr-bad', 100000, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when cash register is not open', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue({ id: 'v1' });
      mockPrisma.cashRegister.findUnique.mockResolvedValue({ id: 'cr-1', status: 'CLOSED' });

      await expect(service.requestDepositToVault('v1', 'cr-1', 100000, 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cash register balance is insufficient', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue({ id: 'v1' });
      mockPrisma.cashRegister.findUnique.mockResolvedValue({
        id: 'cr-1', status: 'OPEN', openingBalance: 50000, totalDeposits: 10000, totalWithdrawals: 30000,
      });

      // Balance = 50000 + 10000 - 30000 = 30000, trying to deposit 100000
      await expect(service.requestDepositToVault('v1', 'cr-1', 100000, 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should notify agency managers after creation', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue({ id: 'v1', agencyId: 'a1' });
      mockPrisma.cashRegister.findUnique.mockResolvedValue({
        id: 'cr-1', status: 'OPEN', openingBalance: 500000, totalDeposits: 0, totalWithdrawals: 0,
      });
      mockPrisma.vaultMovement.create.mockResolvedValue({
        id: 'mv-1', vault: { agency: { name: 'Douala' } }, requestedBy: {},
      });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'chef-1' },
      ]);

      await service.requestDepositToVault('v1', 'cr-1', 100000, 'u1');

      expect(mockNotificationsService.create).toHaveBeenCalled();
    });
  });

  describe('requestWithdrawalFromVault', () => {
    it('should create a withdrawal-from-vault movement', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue({ id: 'v1', agencyId: 'a1', balance: 500000 });
      mockPrisma.cashRegister.findUnique.mockResolvedValue({ id: 'cr-1', status: 'OPEN' });
      const movement = {
        id: 'mv-2', type: 'WITHDRAWAL_FROM_VAULT', amount: 100000,
        vault: { agency: { name: 'Douala' } }, requestedBy: {},
      };
      mockPrisma.vaultMovement.create.mockResolvedValue(movement);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.requestWithdrawalFromVault('v1', 'cr-1', 100000, 'u1');

      expect(result.type).toBe('WITHDRAWAL_FROM_VAULT');
    });

    it('should throw BadRequestException when vault balance is insufficient', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue({ id: 'v1', balance: 50000 });

      await expect(service.requestWithdrawalFromVault('v1', 'cr-1', 100000, 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when vault not found', async () => {
      mockPrisma.vault.findUnique.mockResolvedValue(null);

      await expect(service.requestWithdrawalFromVault('bad', 'cr-1', 100000, 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== APPROVAL WORKFLOW ====================

  describe('approveVaultMovement', () => {
    const pendingMovement = {
      id: 'mv-1', status: 'PENDING', type: 'DEPOSIT_TO_VAULT',
      amount: 100000, requestedById: 'user-requester',
      vaultId: 'v1', cashRegisterId: 'cr-1',
      vault: { id: 'v1' }, cashRegister: { id: 'cr-1' },
    };

    it('should reject a movement when approved=false', async () => {
      mockPrisma.vaultMovement.findUnique.mockResolvedValue(pendingMovement);
      mockPrisma.vaultMovement.update.mockResolvedValue({ ...pendingMovement, status: 'REJECTED' });

      const result = await service.approveVaultMovement('mv-1', false, 'approver-1', 'Montant excessif');

      expect(result.status).toBe('REJECTED');
      expect(mockPrisma.vaultMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REJECTED',
            rejectedReason: 'Montant excessif',
          }),
        }),
      );
    });

    it('should approve and execute a DEPOSIT_TO_VAULT movement', async () => {
      mockPrisma.vaultMovement.findUnique.mockResolvedValue(pendingMovement);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        return fn({
          cashRegister: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'cr-1', openingBalance: 500000, totalDeposits: 0, totalWithdrawals: 0,
            }),
            update: jest.fn(),
          },
          vault: { update: jest.fn() },
          vaultMovement: {
            update: jest.fn().mockResolvedValue({ ...pendingMovement, status: 'APPROVED' }),
          },
        });
      });

      const result = await service.approveVaultMovement('mv-1', true, 'approver-1');

      expect(result.status).toBe('APPROVED');
    });

    it('should approve and execute a WITHDRAWAL_FROM_VAULT movement', async () => {
      const withdrawalMovement = { ...pendingMovement, type: 'WITHDRAWAL_FROM_VAULT' };
      mockPrisma.vaultMovement.findUnique.mockResolvedValue(withdrawalMovement);
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        return fn({
          vault: {
            findUnique: jest.fn().mockResolvedValue({ id: 'v1', balance: 500000 }),
            update: jest.fn(),
          },
          cashRegister: { update: jest.fn() },
          vaultMovement: {
            update: jest.fn().mockResolvedValue({ ...withdrawalMovement, status: 'APPROVED' }),
          },
        });
      });

      const result = await service.approveVaultMovement('mv-1', true, 'approver-1');

      expect(result.status).toBe('APPROVED');
    });

    it('should throw NotFoundException when movement not found', async () => {
      mockPrisma.vaultMovement.findUnique.mockResolvedValue(null);

      await expect(service.approveVaultMovement('bad', true, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when movement already processed', async () => {
      mockPrisma.vaultMovement.findUnique.mockResolvedValue({ ...pendingMovement, status: 'APPROVED' });

      await expect(service.approveVaultMovement('mv-1', true, 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when approver is the requester', async () => {
      mockPrisma.vaultMovement.findUnique.mockResolvedValue(pendingMovement);

      await expect(service.approveVaultMovement('mv-1', true, 'user-requester')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getVaultMovements', () => {
    it('should return paginated vault movements', async () => {
      mockPrisma.vaultMovement.findMany.mockResolvedValue([{ id: 'mv-1' }]);
      mockPrisma.vaultMovement.count.mockResolvedValue(1);

      const result = await service.getVaultMovements({ page: 1, limit: 20 });

      expect(result).toEqual({ data: [{ id: 'mv-1' }], total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('should apply filters for vaultId, agencyId, and status', async () => {
      mockPrisma.vaultMovement.findMany.mockResolvedValue([]);
      mockPrisma.vaultMovement.count.mockResolvedValue(0);

      await service.getVaultMovements({ vaultId: 'v1', agencyId: 'a1', status: 'PENDING' });

      expect(mockPrisma.vaultMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vaultId: 'v1',
            vault: { agencyId: 'a1' },
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  describe('getPendingMovements', () => {
    it('should return pending movements', async () => {
      mockPrisma.vaultMovement.findMany.mockResolvedValue([{ id: 'mv-1', status: 'PENDING' }]);

      const result = await service.getPendingMovements();

      expect(result).toHaveLength(1);
      expect(mockPrisma.vaultMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('should filter by agencyId when provided', async () => {
      mockPrisma.vaultMovement.findMany.mockResolvedValue([]);

      await service.getPendingMovements('a1');

      expect(mockPrisma.vaultMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
            vault: { agencyId: 'a1' },
          }),
        }),
      );
    });
  });

  // ==================== CASH CEILING ====================

  describe('setCashCeiling', () => {
    it('should set a cash ceiling on a cash register', async () => {
      mockPrisma.cashRegister.findUnique.mockResolvedValue({ id: 'cr-1' });
      mockPrisma.cashRegister.update.mockResolvedValue({ id: 'cr-1', cashCeiling: 1000000 });

      const result = await service.setCashCeiling('cr-1', 1000000, 'user-1');

      expect(result.cashCeiling).toBe(1000000);
      expect(mockPrisma.cashRegister.update).toHaveBeenCalledWith({
        where: { id: 'cr-1' },
        data: { cashCeiling: 1000000 },
      });
    });

    it('should remove cash ceiling when null is passed', async () => {
      mockPrisma.cashRegister.findUnique.mockResolvedValue({ id: 'cr-1' });
      mockPrisma.cashRegister.update.mockResolvedValue({ id: 'cr-1', cashCeiling: null });

      const result = await service.setCashCeiling('cr-1', null, 'user-1');

      expect(result.cashCeiling).toBeNull();
    });

    it('should throw NotFoundException when cash register not found', async () => {
      mockPrisma.cashRegister.findUnique.mockResolvedValue(null);

      await expect(service.setCashCeiling('bad', 1000000, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should log the audit event', async () => {
      mockPrisma.cashRegister.findUnique.mockResolvedValue({ id: 'cr-1' });
      mockPrisma.cashRegister.update.mockResolvedValue({ id: 'cr-1' });

      await service.setCashCeiling('cr-1', 2000000, 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'UPDATE',
          module: 'TREASURY',
        }),
      );
    });
  });

  describe('getCashCeilingStatus', () => {
    it('should return status when user has an open register', async () => {
      mockPrisma.cashRegister.findFirst.mockResolvedValue({
        id: 'cr-1', openingBalance: 100000, totalDeposits: 600000, totalWithdrawals: 200000, cashCeiling: 800000,
      });

      const result = await service.getCashCeilingStatus('user-1');

      expect(result.hasOpenRegister).toBe(true);
      expect(result.currentBalance).toBe(500000); // 100000 + 600000 - 200000
      expect(result.ceiling).toBe(800000);
      expect(result.usagePercent).toBe(63); // Math.round(500000/800000 * 100)
    });

    it('should return WARNING when balance exceeds 80% of ceiling', async () => {
      mockPrisma.cashRegister.findFirst.mockResolvedValue({
        id: 'cr-1', openingBalance: 0, totalDeposits: 850000, totalWithdrawals: 0, cashCeiling: 1000000,
      });

      const result = await service.getCashCeilingStatus('user-1');

      expect(result.alert).toBe('WARNING');
    });

    it('should return BLOCKED when balance equals or exceeds ceiling', async () => {
      mockPrisma.cashRegister.findFirst.mockResolvedValue({
        id: 'cr-1', openingBalance: 0, totalDeposits: 1200000, totalWithdrawals: 0, cashCeiling: 1000000,
      });

      const result = await service.getCashCeilingStatus('user-1');

      expect(result.alert).toBe('BLOCKED');
      expect(result.excessAmount).toBe(200000);
    });

    it('should return hasOpenRegister=false when user has no open register', async () => {
      mockPrisma.cashRegister.findFirst.mockResolvedValue(null);

      const result = await service.getCashCeilingStatus('user-1');

      expect(result).toEqual({ hasOpenRegister: false });
    });

    it('should return null alert when no ceiling is set', async () => {
      mockPrisma.cashRegister.findFirst.mockResolvedValue({
        id: 'cr-1', openingBalance: 100000, totalDeposits: 0, totalWithdrawals: 0, cashCeiling: null,
      });

      const result = await service.getCashCeilingStatus('user-1');

      expect(result.ceiling).toBeNull();
      expect(result.usagePercent).toBeNull();
      expect(result.alert).toBeNull();
    });
  });
});
