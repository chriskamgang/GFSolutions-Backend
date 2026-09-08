import { Test, TestingModule } from '@nestjs/testing';
import { SolidarityGroupsController } from './solidarity-groups.controller';
import { SolidarityGroupsService } from './solidarity-groups.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SolidarityGroupsController', () => {
  let controller: SolidarityGroupsController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    dissolve: jest.fn(),
    suspend: jest.fn(),
    reactivate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SolidarityGroupsController],
      providers: [
        { provide: SolidarityGroupsService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<SolidarityGroupsController>(SolidarityGroupsController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create with body', async () => {
      const body = {
        name: 'Groupe A',
        code: 'GS-001',
        agencyId: 'a1',
        presidentId: 'p1',
        treasurerId: 't1',
        maxMembers: 8,
      };
      mockService.create.mockResolvedValue({ id: 'g1', ...body });

      const result = await controller.create(body);

      expect(result).toEqual({ id: 'g1', ...body });
      expect(mockService.create).toHaveBeenCalledWith(body);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with agencyId', async () => {
      mockService.findAll.mockResolvedValue([]);

      const result = await controller.findAll('agency-1');

      expect(result).toEqual([]);
      expect(mockService.findAll).toHaveBeenCalledWith('agency-1');
    });

    it('should call service.findAll without agencyId', async () => {
      mockService.findAll.mockResolvedValue([]);

      await controller.findAll(undefined);

      expect(mockService.findAll).toHaveBeenCalledWith(undefined);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id', async () => {
      const group = { id: 'g1', name: 'G1' };
      mockService.findOne.mockResolvedValue(group);

      const result = await controller.findOne('g1');

      expect(result).toEqual(group);
      expect(mockService.findOne).toHaveBeenCalledWith('g1');
    });
  });

  describe('addMember', () => {
    it('should call service.addMember with groupId, clientId and role', async () => {
      mockService.addMember.mockResolvedValue({ id: 'mem-1' });

      const result = await controller.addMember('g1', { clientId: 'c1', role: 'SECRETARY' });

      expect(result).toEqual({ id: 'mem-1' });
      expect(mockService.addMember).toHaveBeenCalledWith('g1', 'c1', 'SECRETARY');
    });

    it('should call service.addMember with undefined role if not provided', async () => {
      mockService.addMember.mockResolvedValue({ id: 'mem-2' });

      await controller.addMember('g1', { clientId: 'c2' });

      expect(mockService.addMember).toHaveBeenCalledWith('g1', 'c2', undefined);
    });
  });

  describe('removeMember', () => {
    it('should call service.removeMember with groupId and clientId', async () => {
      mockService.removeMember.mockResolvedValue({ id: 'mem-1', isActive: false });

      const result = await controller.removeMember('g1', 'c1');

      expect(result.isActive).toBe(false);
      expect(mockService.removeMember).toHaveBeenCalledWith('g1', 'c1');
    });
  });

  describe('dissolve', () => {
    it('should call service.dissolve with id', async () => {
      mockService.dissolve.mockResolvedValue({ id: 'g1', status: 'DISSOLVED' });

      const result = await controller.dissolve('g1');

      expect(result.status).toBe('DISSOLVED');
      expect(mockService.dissolve).toHaveBeenCalledWith('g1');
    });
  });

  describe('suspend', () => {
    it('should call service.suspend with id', async () => {
      mockService.suspend.mockResolvedValue({ id: 'g1', status: 'SUSPENDED' });

      const result = await controller.suspend('g1');

      expect(result.status).toBe('SUSPENDED');
      expect(mockService.suspend).toHaveBeenCalledWith('g1');
    });
  });

  describe('reactivate', () => {
    it('should call service.reactivate with id', async () => {
      mockService.reactivate.mockResolvedValue({ id: 'g1', status: 'ACTIVE' });

      const result = await controller.reactivate('g1');

      expect(result.status).toBe('ACTIVE');
      expect(mockService.reactivate).toHaveBeenCalledWith('g1');
    });
  });
});
