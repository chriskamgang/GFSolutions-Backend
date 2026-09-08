import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    toggleActive: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
        Reflector,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate to usersService.create with the dto', async () => {
      const dto = {
        email: 'jean.kamga@gfs-cameroun.com',
        phone: '+237690000000',
        password: 'motdepasse123',
        firstName: 'Jean',
        lastName: 'Kamga',
        roleId: 'role-1',
      } as any;
      const expected = { id: '1', ...dto };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should delegate to usersService.findAll without agencyId', async () => {
      const users = [{ id: '1' }];
      mockService.findAll.mockResolvedValue(users);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(users);
    });

    it('should delegate to usersService.findAll with agencyId', async () => {
      const users = [{ id: '1', agencyId: 'ag-1' }];
      mockService.findAll.mockResolvedValue(users);

      const result = await controller.findAll('ag-1');

      expect(mockService.findAll).toHaveBeenCalledWith('ag-1');
      expect(result).toEqual(users);
    });
  });

  describe('findOne', () => {
    it('should delegate to usersService.findOne with id', async () => {
      const user = { id: 'user-1', firstName: 'Jean' };
      mockService.findOne.mockResolvedValue(user);

      const result = await controller.findOne('user-1');

      expect(mockService.findOne).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(user);
    });
  });

  describe('update', () => {
    it('should delegate to usersService.update with id and dto', async () => {
      const dto = { firstName: 'Pierre' } as any;
      const expected = { id: 'user-1', firstName: 'Pierre' };
      mockService.update.mockResolvedValue(expected);

      const result = await controller.update('user-1', dto);

      expect(mockService.update).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('toggleActive', () => {
    it('should delegate to usersService.toggleActive with id', async () => {
      const expected = { id: 'user-1', isActive: false };
      mockService.toggleActive.mockResolvedValue(expected);

      const result = await controller.toggleActive('user-1');

      expect(mockService.toggleActive).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expected);
    });
  });
});
