import { Test, TestingModule } from '@nestjs/testing';
import { SavingsGoalsService } from './savings-goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('SavingsGoalsService', () => {
  let service: SavingsGoalsService;

  const mockPrisma = {
    client: {
      findUnique: jest.fn(),
    },
    savingsAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    savingsGoal: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    savingsContribution: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
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
        SavingsGoalsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<SavingsGoalsService>(SavingsGoalsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== CREATION ====================

  describe('create', () => {
    const dto = {
      clientId: 'client-1',
      savingsAccountId: 'acc-1',
      name: 'Scolarite enfants',
      targetAmount: 500000,
      targetDate: '2027-09-01',
    };

    it('should create a savings goal', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        clientId: 'client-1',
      });
      const goal = { id: 'goal-1', ...dto, client: {}, savingsAccount: {} };
      mockPrisma.savingsGoal.create.mockResolvedValue(goal);

      const result = await service.create(dto as any, 'user-1');

      expect(result).toEqual(goal);
      expect(mockPrisma.savingsGoal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: dto.clientId,
          savingsAccountId: dto.savingsAccountId,
          name: dto.name,
          targetAmount: dto.targetAmount,
          targetDate: new Date(dto.targetDate),
          autoDebit: false,
          bonusRate: 0,
        }),
        include: { client: true, savingsAccount: true },
      });
    });

    it('should create a goal with autoDebit and bonusRate', async () => {
      const dtoFull = {
        ...dto,
        autoDebit: true,
        autoDebitAmount: 25000,
        autoDebitFrequency: 'MONTHLY',
        bonusRate: 2,
      };
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({ id: 'acc-1', clientId: 'client-1' });
      mockPrisma.savingsGoal.create.mockResolvedValue({ id: 'goal-2' });

      await service.create(dtoFull as any, 'user-1');

      expect(mockPrisma.savingsGoal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          autoDebit: true,
          autoDebitAmount: 25000,
          autoDebitFrequency: 'MONTHLY',
          bonusRate: 2,
        }),
        include: { client: true, savingsAccount: true },
      });
    });

    it('should throw NotFoundException if client not found', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.create(dto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if savings account not found', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.savingsAccount.findUnique.mockResolvedValue(null);

      await expect(service.create(dto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if account does not belong to client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        clientId: 'other-client',
      });

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should not call audit when userId is not provided', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({ id: 'acc-1', clientId: 'client-1' });
      mockPrisma.savingsGoal.create.mockResolvedValue({ id: 'goal-3' });

      await service.create(dto as any);

      expect(mockAuditService.log).not.toHaveBeenCalled();
    });
  });

  // ==================== LISTE ====================

  describe('findAll', () => {
    it('should return paginated savings goals', async () => {
      const goals = [{ id: 'goal-1' }];
      mockPrisma.savingsGoal.findMany.mockResolvedValue(goals);
      mockPrisma.savingsGoal.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual(goals);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('should filter by clientId', async () => {
      mockPrisma.savingsGoal.findMany.mockResolvedValue([]);
      mockPrisma.savingsGoal.count.mockResolvedValue(0);

      await service.findAll({ clientId: 'c1' });

      expect(mockPrisma.savingsGoal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'c1' },
        }),
      );
    });

    it('should filter by isCompleted', async () => {
      mockPrisma.savingsGoal.findMany.mockResolvedValue([]);
      mockPrisma.savingsGoal.count.mockResolvedValue(0);

      await service.findAll({ isCompleted: true });

      expect(mockPrisma.savingsGoal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isCompleted: true },
        }),
      );
    });
  });

  // ==================== DETAIL ====================

  describe('findOne', () => {
    it('should return a goal with percentage', async () => {
      const goal = {
        id: 'goal-1',
        targetAmount: 500000,
        currentAmount: 250000,
        client: {},
        savingsAccount: {},
      };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);

      const result = await service.findOne('goal-1');

      expect(result.percentage).toBe(50);
    });

    it('should cap percentage at 100', async () => {
      const goal = {
        id: 'goal-1',
        targetAmount: 100000,
        currentAmount: 150000,
      };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);

      const result = await service.findOne('goal-1');

      expect(result.percentage).toBe(100);
    });

    it('should return 0 percentage when target is 0', async () => {
      const goal = {
        id: 'goal-1',
        targetAmount: 0,
        currentAmount: 0,
      };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);

      const result = await service.findOne('goal-1');

      expect(result.percentage).toBe(0);
    });

    it('should throw NotFoundException if goal not found', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== CONTRIBUTION ====================

  describe('contribute', () => {
    const dto = { amount: 100000 };

    const goal = {
      id: 'goal-1',
      name: 'Scolarite',
      clientId: 'client-1',
      savingsAccountId: 'acc-1',
      targetAmount: 500000,
      currentAmount: 200000,
      isCompleted: false,
      savingsAccount: { id: 'acc-1', balance: 200000 },
      client: { id: 'client-1' },
    };

    it('should contribute to a goal and update balances', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);
      mockPrisma.savingsGoal.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});
      mockPrisma.savingsAccount.update.mockResolvedValue({});

      const result = await service.contribute('goal-1', dto as any, 'user-1');

      expect(result.goalId).toBe('goal-1');
      expect(result.contributed).toBe(100000);
      expect(result.currentAmount).toBe(300000);
      expect(result.targetAmount).toBe(500000);
      expect(result.percentage).toBe(60);
      expect(result.isCompleted).toBe(false);
    });

    it('should mark goal as completed when target is reached', async () => {
      const goalAlmostDone = { ...goal, currentAmount: 450000 };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goalAlmostDone);
      mockPrisma.savingsGoal.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});
      mockPrisma.savingsAccount.update.mockResolvedValue({});

      const result = await service.contribute('goal-1', { amount: 50000 } as any);

      expect(result.isCompleted).toBe(true);
      expect(result.percentage).toBe(100);
      expect(mockPrisma.savingsGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCompleted: true,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should mark goal as completed when contribution exceeds target', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);
      mockPrisma.savingsGoal.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});
      mockPrisma.savingsAccount.update.mockResolvedValue({});

      const result = await service.contribute('goal-1', { amount: 400000 } as any);

      expect(result.isCompleted).toBe(true);
      expect(result.currentAmount).toBe(600000);
    });

    it('should create notification on milestone (50%)', async () => {
      // currentAmount 200000 -> 300000 on target 500000 => 40% -> 60%, crosses 50%
      const goalAt40 = { ...goal, currentAmount: 200000 };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goalAt40);
      mockPrisma.savingsGoal.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});
      mockPrisma.savingsAccount.update.mockResolvedValue({});

      await service.contribute('goal-1', { amount: 100000 } as any);

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'CLIENT',
          targetId: 'client-1',
        }),
      );
    });

    it('should create notification on 100% milestone', async () => {
      const goalAt90 = { ...goal, currentAmount: 450000 };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goalAt90);
      mockPrisma.savingsGoal.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});
      mockPrisma.savingsAccount.update.mockResolvedValue({});

      await service.contribute('goal-1', { amount: 100000 } as any);

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Objectif atteint !',
        }),
      );
    });

    it('should throw NotFoundException if goal not found', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(null);

      await expect(service.contribute('missing', dto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if goal is already completed', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue({ ...goal, isCompleted: true });

      await expect(service.contribute('goal-1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should not call audit when userId is not provided', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);
      mockPrisma.savingsGoal.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});
      mockPrisma.savingsAccount.update.mockResolvedValue({});

      await service.contribute('goal-1', dto as any);

      expect(mockAuditService.log).not.toHaveBeenCalled();
    });

    it('should update savings account balance and totalDeposits', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);
      mockPrisma.savingsGoal.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});
      mockPrisma.savingsAccount.update.mockResolvedValue({});

      await service.contribute('goal-1', dto as any);

      expect(mockPrisma.savingsAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: {
          balance: 300000, // 200000 + 100000
          totalDeposits: { increment: 100000 },
        },
      });
    });
  });

  // ==================== DEBLOCAGE ====================

  describe('unlock', () => {
    const goal = {
      id: 'goal-1',
      name: 'Scolarite',
      isCompleted: true,
      isUnlocked: false,
      currentAmount: 500000,
      bonusRate: 2,
      savingsAccountId: 'acc-1',
      savingsAccount: { id: 'acc-1', balance: 500000 },
    };

    it('should unlock a completed goal and credit bonus', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);
      const updated = { ...goal, isUnlocked: true, client: {}, savingsAccount: {} };
      mockPrisma.savingsGoal.update.mockResolvedValue(updated);
      mockPrisma.savingsAccount.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});

      const result = await service.unlock('goal-1', 'user-1');

      expect(result.bonusAmount).toBe(10000); // 500000 * 2 / 100
      expect(mockPrisma.savingsAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: {
          balance: 510000, // 500000 + 10000 bonus
          interestEarned: { increment: 10000 },
        },
      });
      expect(mockPrisma.savingsContribution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INTEREST',
          amount: 10000,
        }),
      });
    });

    it('should unlock without bonus if bonusRate is 0', async () => {
      const noBonusGoal = { ...goal, bonusRate: 0 };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(noBonusGoal);
      mockPrisma.savingsGoal.update.mockResolvedValue({ ...noBonusGoal, isUnlocked: true, client: {}, savingsAccount: {} });

      const result = await service.unlock('goal-1');

      expect(result.bonusAmount).toBe(0);
      expect(mockPrisma.savingsAccount.update).not.toHaveBeenCalled();
      expect(mockPrisma.savingsContribution.create).not.toHaveBeenCalled();
    });

    it('should unlock without bonus if goal is not completed', async () => {
      const incompleteGoal = { ...goal, isCompleted: false };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(incompleteGoal);
      mockPrisma.savingsGoal.update.mockResolvedValue({ ...incompleteGoal, isUnlocked: true, client: {}, savingsAccount: {} });

      const result = await service.unlock('goal-1');

      expect(result.bonusAmount).toBe(0);
    });

    it('should throw NotFoundException if goal not found', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(null);

      await expect(service.unlock('missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if goal is already unlocked', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue({ ...goal, isUnlocked: true });

      await expect(service.unlock('goal-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== PROGRESSION ====================

  describe('getProgress', () => {
    it('should return progress information', async () => {
      const now = new Date();
      const createdAt = new Date(now);
      createdAt.setMonth(createdAt.getMonth() - 3);
      const targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() + 9);

      const goal = {
        id: 'goal-1',
        targetAmount: 500000,
        currentAmount: 200000,
        targetDate,
        createdAt,
        isCompleted: false,
        isUnlocked: false,
      };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);

      const result = await service.getProgress('goal-1');

      expect(result.targetAmount).toBe(500000);
      expect(result.currentAmount).toBe(200000);
      expect(result.percentage).toBe(40);
      expect(result.remainingAmount).toBe(300000);
      expect(result.remainingDays).toBeGreaterThan(0);
      expect(result.isCompleted).toBe(false);
      expect(result.isUnlocked).toBe(false);
      expect(typeof result.onTrack).toBe('boolean');
    });

    it('should return 0 remaining amount when target exceeded', async () => {
      const goal = {
        id: 'goal-1',
        targetAmount: 100000,
        currentAmount: 150000,
        targetDate: new Date(Date.now() + 86400000 * 30),
        createdAt: new Date(Date.now() - 86400000 * 60),
        isCompleted: true,
        isUnlocked: false,
      };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);

      const result = await service.getProgress('goal-1');

      expect(result.remainingAmount).toBe(0);
      expect(result.percentage).toBe(100);
    });

    it('should return 0 remaining days when target date has passed', async () => {
      const goal = {
        id: 'goal-1',
        targetAmount: 500000,
        currentAmount: 200000,
        targetDate: new Date(Date.now() - 86400000), // yesterday
        createdAt: new Date(Date.now() - 86400000 * 60),
        isCompleted: false,
        isUnlocked: false,
      };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);

      const result = await service.getProgress('goal-1');

      expect(result.remainingDays).toBe(0);
    });

    it('should throw NotFoundException if goal not found', async () => {
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(null);

      await expect(service.getProgress('missing')).rejects.toThrow(NotFoundException);
    });

    it('should return onTrack true for completed goals', async () => {
      const goal = {
        id: 'goal-1',
        targetAmount: 100000,
        currentAmount: 100000,
        targetDate: new Date(Date.now() + 86400000 * 30),
        createdAt: new Date(Date.now() - 86400000 * 60),
        isCompleted: true,
        isUnlocked: false,
      };
      mockPrisma.savingsGoal.findUnique.mockResolvedValue(goal);

      const result = await service.getProgress('goal-1');

      expect(result.onTrack).toBe(true);
    });
  });
});
