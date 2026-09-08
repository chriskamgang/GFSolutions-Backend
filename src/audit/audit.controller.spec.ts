import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { RolesGuard } from '../common/guards/roles.guard';

describe('AuditController', () => {
  let controller: AuditController;
  let service: AuditService;

  const mockAuditService = {
    findAll: jest.fn(),
    getStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: mockAuditService }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuditController>(AuditController);
    service = module.get<AuditService>(AuditService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with parsed params', async () => {
      const expected = { data: [], total: 0, page: 2, limit: 10 };
      mockAuditService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('2', '10', 'user-1', 'AML');

      expect(mockAuditService.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        userId: 'user-1',
        module: 'AML',
      });
      expect(result).toEqual(expected);
    });

    it('should use default page=1 and limit=20 when not provided', async () => {
      mockAuditService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.findAll(undefined, undefined, undefined, undefined);

      expect(mockAuditService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        userId: undefined,
        module: undefined,
      });
    });

    it('should pass only userId filter', async () => {
      mockAuditService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.findAll(undefined, undefined, 'user-1', undefined);

      expect(mockAuditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', module: undefined }),
      );
    });

    it('should pass only module filter', async () => {
      mockAuditService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.findAll(undefined, undefined, undefined, 'CLIENTS');

      expect(mockAuditService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ userId: undefined, module: 'CLIENTS' }),
      );
    });
  });

  describe('getStats', () => {
    it('should return stats from service', async () => {
      const stats = { totalToday: 10, totalWeek: 50 };
      mockAuditService.getStats.mockResolvedValue(stats);

      const result = await controller.getStats();

      expect(result).toEqual(stats);
      expect(mockAuditService.getStats).toHaveBeenCalled();
    });
  });
});
