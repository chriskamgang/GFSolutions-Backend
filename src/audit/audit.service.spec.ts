import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: PrismaService;

  const mockPrismaService = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ────────────────────────────────────────────────────────
  // log
  // ────────────────────────────────────────────────────────
  describe('log', () => {
    it('should create an audit log entry', async () => {
      const logData = {
        userId: 'user-1',
        action: 'CREATE',
        module: 'CLIENTS',
        entityId: 'client-1',
        entityType: 'Client',
        details: 'Nouveau client cree',
      };
      const created = { id: 'log-1', ...logData };
      mockPrismaService.auditLog.create.mockResolvedValue(created);

      const result = await service.log(logData);

      expect(result).toEqual(created);
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'CREATE',
          module: 'CLIENTS',
          entityId: 'client-1',
          entityType: 'Client',
          newValues: { details: 'Nouveau client cree' },
        },
      });
    });

    it('should use newValues when provided', async () => {
      const logData = {
        userId: 'user-1',
        action: 'UPDATE',
        module: 'ACCOUNTS',
        newValues: { balance: 50000 },
      };
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log(logData);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          newValues: { balance: 50000 },
        }),
      });
    });

    it('should pass oldValues if provided', async () => {
      const logData = {
        userId: 'user-1',
        action: 'UPDATE',
        module: 'ACCOUNTS',
        oldValues: { balance: 10000 },
        newValues: { balance: 50000 },
      };
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log(logData);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldValues: { balance: 10000 },
          newValues: { balance: 50000 },
        }),
      });
    });

    it('should handle log with no details and no newValues', async () => {
      const logData = {
        userId: 'user-1',
        action: 'LOGIN',
        module: 'AUTH',
      };
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log(logData);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'LOGIN',
          module: 'AUTH',
          newValues: undefined,
        }),
      });
    });

    it('should include ipAddress when provided', async () => {
      const logData = {
        userId: 'user-1',
        action: 'LOGIN',
        module: 'AUTH',
        ipAddress: '192.168.1.1',
      };
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log(logData);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: '192.168.1.1',
        }),
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // findAll
  // ────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      const mockData = [{ id: 'log-1' }, { id: 'log-2' }];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockData);
      mockPrismaService.auditLog.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ data: mockData, total: 2, page: 1, limit: 20 });
    });

    it('should apply userId filter', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findAll({ userId: 'user-1' });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        }),
      );
    });

    it('should apply module filter', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findAll({ module: 'AML' });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { module: 'AML' },
        }),
      );
    });

    it('should apply both userId and module filters together', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findAll({ userId: 'user-1', module: 'CLIENTS' });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', module: 'CLIENTS' },
        }),
      );
    });

    it('should use default page=1 and limit=20 when not provided', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findAll({});

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should paginate correctly on page 3 with limit 10', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findAll({ page: 3, limit: 10 });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it('should order by createdAt desc', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findAll({});

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should include user details', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findAll({});

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────
  // getStats
  // ────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('should return today and week counts', async () => {
      mockPrismaService.auditLog.count
        .mockResolvedValueOnce(15)  // totalToday
        .mockResolvedValueOnce(85); // totalWeek

      const result = await service.getStats();

      expect(result).toEqual({ totalToday: 15, totalWeek: 85 });
    });

    it('should call count with date filters', async () => {
      mockPrismaService.auditLog.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      await service.getStats();

      // First call: today filter
      expect(mockPrismaService.auditLog.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: expect.any(Date) } },
      });
      // Both calls should filter by date
      expect(mockPrismaService.auditLog.count).toHaveBeenCalledTimes(2);
    });
  });
});
