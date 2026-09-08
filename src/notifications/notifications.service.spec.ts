import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ────────────────────────────────────────────────────────
  // create
  // ────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create a notification with default channel SYSTEM', async () => {
      const created = { id: 'notif-1', targetType: 'USER', targetId: 'user-1', title: 'Test', message: 'Hello', channel: 'SYSTEM' };
      mockPrismaService.notification.create.mockResolvedValue(created);

      const result = await service.create({
        targetType: 'USER',
        targetId: 'user-1',
        title: 'Test',
        message: 'Hello',
      });

      expect(result).toEqual(created);
      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: {
          targetType: 'USER',
          targetId: 'user-1',
          title: 'Test',
          message: 'Hello',
          channel: 'SYSTEM',
        },
      });
    });

    it('should create a notification with custom channel', async () => {
      mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.create({
        targetType: 'CLIENT',
        targetId: 'client-1',
        title: 'Depot',
        message: 'Depot recu',
        channel: 'SMS',
      });

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ channel: 'SMS' }),
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // notifyStaff
  // ────────────────────────────────────────────────────────
  describe('notifyStaff', () => {
    it('should create a SYSTEM notification for a staff user', async () => {
      const created = { id: 'notif-1', targetType: 'USER', targetId: 'user-1', channel: 'SYSTEM' };
      mockPrismaService.notification.create.mockResolvedValue(created);

      const result = await service.notifyStaff('user-1', 'Alerte AML', 'Nouvelle alerte detectee');

      expect(result).toEqual(created);
      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: {
          targetType: 'USER',
          targetId: 'user-1',
          title: 'Alerte AML',
          message: 'Nouvelle alerte detectee',
          channel: 'SYSTEM',
        },
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // notifyDeposit
  // ────────────────────────────────────────────────────────
  describe('notifyDeposit', () => {
    it('should create SMS notification for deposit', async () => {
      mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.notifyDeposit('client-1', 500_000, 'ACC-001');

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetType: 'CLIENT',
          targetId: 'client-1',
          title: 'Depot recu',
          channel: 'SMS',
        }),
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // notifyWithdrawal
  // ────────────────────────────────────────────────────────
  describe('notifyWithdrawal', () => {
    it('should create SMS notification for withdrawal', async () => {
      mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.notifyWithdrawal('client-1', 200_000, 'ACC-001');

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetType: 'CLIENT',
          targetId: 'client-1',
          title: 'Retrait effectue',
          channel: 'SMS',
        }),
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // notifyCreditApproved
  // ────────────────────────────────────────────────────────
  describe('notifyCreditApproved', () => {
    it('should create SMS notification for approved credit', async () => {
      mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.notifyCreditApproved('client-1', 1_000_000);

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetType: 'CLIENT',
          title: 'Credit approuve',
          channel: 'SMS',
        }),
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // notifyCreditDue
  // ────────────────────────────────────────────────────────
  describe('notifyCreditDue', () => {
    it('should create SMS notification for credit due', async () => {
      mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.notifyCreditDue('client-1', 50_000, '2026-08-15');

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetType: 'CLIENT',
          title: 'Echeance de credit',
          channel: 'SMS',
        }),
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // findAll
  // ────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated notifications', async () => {
      const mockData = [{ id: 'notif-1' }, { id: 'notif-2' }];
      mockPrismaService.notification.findMany.mockResolvedValue(mockData);
      mockPrismaService.notification.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ data: mockData, total: 2, page: 1, limit: 20 });
    });

    it('should apply targetId filter', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll({ targetId: 'user-1' });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ targetId: 'user-1' }),
        }),
      );
    });

    it('should apply targetType filter', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll({ targetType: 'CLIENT' });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ targetType: 'CLIENT' }),
        }),
      );
    });

    it('should apply isRead filter', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll({ isRead: false });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isRead: false }),
        }),
      );
    });

    it('should use defaults for page and limit', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll({});

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('should paginate correctly', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(100);

      await service.findAll({ page: 5, limit: 10 });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 10 }),
      );
    });

    it('should order by createdAt desc', async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.notification.count.mockResolvedValue(0);

      await service.findAll({});

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  // ────────────────────────────────────────────────────────
  // markAsRead
  // ────────────────────────────────────────────────────────
  describe('markAsRead', () => {
    it('should mark a single notification as read', async () => {
      const updated = { id: 'notif-1', isRead: true };
      mockPrismaService.notification.update.mockResolvedValue(updated);

      const result = await service.markAsRead('notif-1');

      expect(result).toEqual(updated);
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { isRead: true },
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // markAllAsRead
  // ────────────────────────────────────────────────────────
  describe('markAllAsRead', () => {
    it('should mark all unread notifications for a target as read', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({ count: 5 });
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: { targetId: 'user-1', isRead: false },
        data: { isRead: true },
      });
    });

    it('should return count 0 when no unread notifications', async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({ count: 0 });
    });
  });

  // ────────────────────────────────────────────────────────
  // getUnreadCount
  // ────────────────────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('should return the count of unread notifications', async () => {
      mockPrismaService.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ count: 7 });
      expect(mockPrismaService.notification.count).toHaveBeenCalledWith({
        where: { targetId: 'user-1', isRead: false },
      });
    });

    it('should return 0 when no unread notifications', async () => {
      mockPrismaService.notification.count.mockResolvedValue(0);

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ count: 0 });
    });
  });
});
