import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesController', () => {
  let controller: RolesController;
  let service: RolesService;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updatePermissions: jest.fn(),
    getAllPermissions: jest.fn(),
    seedDefaultRolesAndPermissions: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        { provide: RolesService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
        Reflector,
      ],
    }).compile();

    controller = module.get<RolesController>(RolesController);
    service = module.get<RolesService>(RolesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate to rolesService.create with the body', async () => {
      const body = {
        name: 'NEW_ROLE',
        description: 'Description',
        permissionIds: ['p1', 'p2'],
      };
      const expected = { id: '1', ...body };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(body);

      expect(mockService.create).toHaveBeenCalledWith(body);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should delegate to rolesService.findAll', async () => {
      const roles = [{ id: '1', name: 'ADMIN' }];
      mockService.findAll.mockResolvedValue(roles);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalled();
      expect(result).toEqual(roles);
    });
  });

  describe('getAllPermissions', () => {
    it('should delegate to rolesService.getAllPermissions', async () => {
      const permissions = [{ id: '1', module: 'CLIENTS', action: 'READ' }];
      mockService.getAllPermissions.mockResolvedValue(permissions);

      const result = await controller.getAllPermissions();

      expect(mockService.getAllPermissions).toHaveBeenCalled();
      expect(result).toEqual(permissions);
    });
  });

  describe('findOne', () => {
    it('should delegate to rolesService.findOne with id', async () => {
      const role = { id: 'role-1', name: 'ADMIN' };
      mockService.findOne.mockResolvedValue(role);

      const result = await controller.findOne('role-1');

      expect(mockService.findOne).toHaveBeenCalledWith('role-1');
      expect(result).toEqual(role);
    });
  });

  describe('updatePermissions', () => {
    it('should delegate to rolesService.updatePermissions with id and permissionIds', async () => {
      const expected = { id: 'role-1', permissions: [] };
      mockService.updatePermissions.mockResolvedValue(expected);

      const result = await controller.updatePermissions('role-1', ['p1', 'p2']);

      expect(mockService.updatePermissions).toHaveBeenCalledWith('role-1', ['p1', 'p2']);
      expect(result).toEqual(expected);
    });
  });

  describe('seed', () => {
    it('should delegate to rolesService.seedDefaultRolesAndPermissions', async () => {
      const expected = { message: '11 roles et 52 permissions initialises avec succes' };
      mockService.seedDefaultRolesAndPermissions.mockResolvedValue(expected);

      const result = await controller.seed();

      expect(mockService.seedDefaultRolesAndPermissions).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });
  });
});
