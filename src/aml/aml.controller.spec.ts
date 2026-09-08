import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { AmlController } from './aml.controller';
import { AmlService } from './aml.service';
import { RolesGuard } from '../common/guards/roles.guard';

describe('AmlController', () => {
  let controller: AmlController;
  let service: AmlService;

  const mockAmlService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
    reportToAuthority: jest.fn(),
    getStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AmlController],
      providers: [{ provide: AmlService, useValue: mockAmlService }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AmlController>(AmlController);
    service = module.get<AmlService>(AmlService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with parsed params', async () => {
      const expected = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockAmlService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('OPEN', 'HIGH', 'PEP', 'client-1', '2', '10');

      expect(mockAmlService.findAll).toHaveBeenCalledWith({
        status: 'OPEN',
        riskLevel: 'HIGH',
        alertType: 'PEP',
        clientId: 'client-1',
        page: 2,
        limit: 10,
      });
      expect(result).toEqual(expected);
    });

    it('should use default page and limit when not provided', async () => {
      mockAmlService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined);

      expect(mockAmlService.findAll).toHaveBeenCalledWith({
        status: undefined,
        riskLevel: undefined,
        alertType: undefined,
        clientId: undefined,
        page: 1,
        limit: 20,
      });
    });
  });

  describe('getStats', () => {
    it('should return stats from service', async () => {
      const stats = { total: 10, open: 5, investigating: 3, escalated: 1, reported: 1, byRisk: {}, byType: {} };
      mockAmlService.getStats.mockResolvedValue(stats);

      const result = await controller.getStats();

      expect(result).toEqual(stats);
      expect(mockAmlService.getStats).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id', async () => {
      const alert = { id: 'alert-1', reference: 'AML-001' };
      mockAmlService.findOne.mockResolvedValue(alert);

      const result = await controller.findOne('alert-1');

      expect(result).toEqual(alert);
      expect(mockAmlService.findOne).toHaveBeenCalledWith('alert-1');
    });
  });

  describe('updateStatus', () => {
    it('should call service.updateStatus with id, dto, and user.sub', async () => {
      const dto = { status: 'INVESTIGATING', investigationNotes: 'En cours' };
      const user = { sub: 'user-1' };
      const updated = { id: 'alert-1', status: 'INVESTIGATING' };
      mockAmlService.updateStatus.mockResolvedValue(updated);

      const result = await controller.updateStatus('alert-1', dto, user);

      expect(mockAmlService.updateStatus).toHaveBeenCalledWith('alert-1', dto, 'user-1');
      expect(result).toEqual(updated);
    });
  });

  describe('reportToAuthority', () => {
    it('should call service.reportToAuthority with id and user.sub', async () => {
      const user = { sub: 'user-1' };
      const reported = { id: 'alert-1', reportedToAuthority: true, status: 'REPORTED' };
      mockAmlService.reportToAuthority.mockResolvedValue(reported);

      const result = await controller.reportToAuthority('alert-1', user);

      expect(mockAmlService.reportToAuthority).toHaveBeenCalledWith('alert-1', 'user-1');
      expect(result).toEqual(reported);
    });
  });
});
