import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let controller: AppController;

  const mockPrisma = {
    client: { count: jest.fn() },
    account: { count: jest.fn() },
    transaction: { count: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = app.get<AppController>(AppController);
    jest.clearAllMocks();
  });

  describe('getHello', () => {
    it('should return API status', () => {
      const result = controller.getHello();
      expect(result).toEqual({ message: 'API MicroFinance Cameroun v1.0', status: 'running' });
    });
  });

  describe('getDashboardStats', () => {
    it('should return dashboard statistics', async () => {
      mockPrisma.client.count.mockResolvedValue(50);
      mockPrisma.account.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80);
      mockPrisma.transaction.count.mockResolvedValue(500);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 1000000 } })
        .mockResolvedValueOnce({ _sum: { amount: 500000 } });

      const result = await controller.getDashboardStats();
      expect(result.totalClients).toBe(50);
      expect(result.totalAccounts).toBe(100);
      expect(result.activeAccounts).toBe(80);
      expect(result.totalTransactions).toBe(500);
      expect(result.depositsMonth).toBe(1000000);
      expect(result.withdrawalsMonth).toBe(500000);
    });

    it('should handle null aggregates', async () => {
      mockPrisma.client.count.mockResolvedValue(0);
      mockPrisma.account.count.mockResolvedValue(0).mockResolvedValue(0);
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });

      const result = await controller.getDashboardStats();
      expect(result.depositsMonth).toBe(0);
      expect(result.withdrawalsMonth).toBe(0);
    });
  });
});
