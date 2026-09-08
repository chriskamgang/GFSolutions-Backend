import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  const mockNotificationsService = {
    findAll: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockNotificationsService }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with user.sub as targetId and type USER', async () => {
      const user = { sub: 'user-1' };
      const expected = { data: [], total: 0, page: 1, limit: 20 };
      mockNotificationsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(user, '1', '20');

      expect(mockNotificationsService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        targetId: 'user-1',
        targetType: 'USER',
      });
      expect(result).toEqual(expected);
    });

    it('should use default page and limit when not provided', async () => {
      const user = { sub: 'user-1' };
      mockNotificationsService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.findAll(user, undefined, undefined);

      expect(mockNotificationsService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        targetId: 'user-1',
        targetType: 'USER',
      });
    });

    it('should parse page and limit strings to numbers', async () => {
      const user = { sub: 'user-1' };
      mockNotificationsService.findAll.mockResolvedValue({ data: [], total: 0, page: 3, limit: 10 });

      await controller.findAll(user, '3', '10');

      expect(mockNotificationsService.findAll).toHaveBeenCalledWith({
        page: 3,
        limit: 10,
        targetId: 'user-1',
        targetType: 'USER',
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count for current user', async () => {
      const user = { sub: 'user-1' };
      mockNotificationsService.getUnreadCount.mockResolvedValue({ count: 5 });

      const result = await controller.getUnreadCount(user);

      expect(result).toEqual({ count: 5 });
      expect(mockNotificationsService.getUnreadCount).toHaveBeenCalledWith('user-1');
    });

    it('should return 0 when no unread notifications', async () => {
      const user = { sub: 'user-1' };
      mockNotificationsService.getUnreadCount.mockResolvedValue({ count: 0 });

      const result = await controller.getUnreadCount(user);

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('markAsRead', () => {
    it('should call service.markAsRead with notification id', async () => {
      const updated = { id: 'notif-1', isRead: true };
      mockNotificationsService.markAsRead.mockResolvedValue(updated);

      const result = await controller.markAsRead('notif-1');

      expect(result).toEqual(updated);
      expect(mockNotificationsService.markAsRead).toHaveBeenCalledWith('notif-1');
    });
  });

  describe('markAllAsRead', () => {
    it('should call service.markAllAsRead with user.sub', async () => {
      const user = { sub: 'user-1' };
      mockNotificationsService.markAllAsRead.mockResolvedValue({ count: 3 });

      const result = await controller.markAllAsRead(user);

      expect(result).toEqual({ count: 3 });
      expect(mockNotificationsService.markAllAsRead).toHaveBeenCalledWith('user-1');
    });
  });
});
