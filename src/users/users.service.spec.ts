import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;

  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── CREATE ──────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      email: 'jean.kamga@gfs-cameroun.com',
      phone: '+237690000000',
      password: 'motdepasse123',
      firstName: 'Jean',
      lastName: 'Kamga',
      roleId: 'role-1',
    };

    it('should create a user with hashed password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const createdUser = { id: 'user-1', ...createDto, password: 'hashed_password' };
      mockPrisma.user.create.mockResolvedValue(createdUser);

      const result = await service.create(createDto);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ email: createDto.email }, { phone: createDto.phone }] },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('motdepasse123', 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: { ...createDto, password: 'hashed_password' },
        include: { role: true, agency: true },
      });
      expect(result).toEqual(createdUser);
    });

    it('should throw ConflictException when email or phone already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ─── FIND ALL ────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all users when no agencyId filter', async () => {
      const users = [{ id: '1' }, { id: '2' }];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const result = await service.findAll();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: undefined,
        include: { role: true, agency: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(users);
    });

    it('should filter by agencyId when provided', async () => {
      const users = [{ id: '1', agencyId: 'ag-1' }];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const result = await service.findAll('ag-1');

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { agencyId: 'ag-1' },
        include: { role: true, agency: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(users);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a user by id with role and agency', async () => {
      const user = {
        id: 'user-1',
        firstName: 'Jean',
        role: { permissions: [] },
        agency: { name: 'Agence A' },
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne('user-1');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          agency: true,
        },
      });
      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── UPDATE ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a user', async () => {
      const existing = { id: 'user-1', firstName: 'Jean', isActive: true };
      mockPrisma.user.findUnique.mockResolvedValue(existing);
      const updateDto = { firstName: 'Pierre' };
      const updated = { ...existing, ...updateDto };
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.update('user-1', updateDto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: updateDto,
        include: { role: true, agency: true },
      });
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', { firstName: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── TOGGLE ACTIVE ─────────────────────────────────────────────────────

  describe('toggleActive', () => {
    it('should toggle user from active to inactive', async () => {
      const user = { id: 'user-1', isActive: true };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue({ ...user, isActive: false });

      const result = await service.toggleActive('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('should toggle user from inactive to active', async () => {
      const user = { id: 'user-1', isActive: false };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue({ ...user, isActive: true });

      const result = await service.toggleActive('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: true },
      });
      expect(result.isActive).toBe(true);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.toggleActive('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
