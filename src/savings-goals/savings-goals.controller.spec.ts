import { Test, TestingModule } from '@nestjs/testing';
import { SavingsGoalsController } from './savings-goals.controller';
import { SavingsGoalsService } from './savings-goals.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SavingsGoalsController', () => {
  let controller: SavingsGoalsController;
  let service: SavingsGoalsService;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getProgress: jest.fn(),
    contribute: jest.fn(),
    unlock: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavingsGoalsController],
      providers: [
        { provide: SavingsGoalsService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<SavingsGoalsController>(SavingsGoalsController);
    service = module.get<SavingsGoalsService>(SavingsGoalsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create with dto and userId', async () => {
      const dto = {
        clientId: 'c1',
        savingsAccountId: 'acc-1',
        name: 'Test',
        targetAmount: 500000,
        targetDate: '2027-09-01',
      };
      mockService.create.mockResolvedValue({ id: 'goal-1' });

      const result = await controller.create(dto as any, 'user-1');

      expect(result).toEqual({ id: 'goal-1' });
      expect(mockService.create).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with parsed params', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll('c1', 'true', '2', '10');

      expect(mockService.findAll).toHaveBeenCalledWith({
        clientId: 'c1',
        isCompleted: true,
        page: 2,
        limit: 10,
      });
    });

    it('should use default page and limit when not provided', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(undefined, undefined, undefined, undefined);

      expect(mockService.findAll).toHaveBeenCalledWith({
        clientId: undefined,
        isCompleted: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('should pass isCompleted as false when string is "false"', async () => {
      mockService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(undefined, 'false', undefined, undefined);

      expect(mockService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isCompleted: false }),
      );
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id', async () => {
      mockService.findOne.mockResolvedValue({ id: 'goal-1', percentage: 50 });

      const result = await controller.findOne('goal-1');

      expect(result.percentage).toBe(50);
      expect(mockService.findOne).toHaveBeenCalledWith('goal-1');
    });
  });

  describe('getProgress', () => {
    it('should call service.getProgress with id', async () => {
      mockService.getProgress.mockResolvedValue({
        percentage: 40,
        remainingAmount: 300000,
        onTrack: true,
      });

      const result = await controller.getProgress('goal-1');

      expect(result.percentage).toBe(40);
      expect(result.onTrack).toBe(true);
      expect(mockService.getProgress).toHaveBeenCalledWith('goal-1');
    });
  });

  describe('contribute', () => {
    it('should call service.contribute with id, dto, and userId', async () => {
      const dto = { amount: 50000 };
      mockService.contribute.mockResolvedValue({
        goalId: 'goal-1',
        contributed: 50000,
        currentAmount: 250000,
        percentage: 50,
        isCompleted: false,
      });

      const result = await controller.contribute('goal-1', dto as any, 'user-1');

      expect(result.contributed).toBe(50000);
      expect(mockService.contribute).toHaveBeenCalledWith('goal-1', dto, 'user-1');
    });
  });

  describe('unlock', () => {
    it('should call service.unlock with id and userId', async () => {
      mockService.unlock.mockResolvedValue({
        id: 'goal-1',
        isUnlocked: true,
        bonusAmount: 10000,
      });

      const result = await controller.unlock('goal-1', 'user-1');

      expect(result.isUnlocked).toBe(true);
      expect(result.bonusAmount).toBe(10000);
      expect(mockService.unlock).toHaveBeenCalledWith('goal-1', 'user-1');
    });
  });
});
