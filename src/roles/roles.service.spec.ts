import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesService', () => {
  let service: RolesService;

  const mockPrisma = {
    role: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    rolePermission: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    permission: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── CREATE ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a role without permissions', async () => {
      const createData = {
        name: 'CUSTOM_ROLE',
        description: 'Un role custom',
      };
      mockPrisma.role.findUnique
        .mockResolvedValueOnce(null) // check for existing
        .mockResolvedValueOnce({ id: 'role-1', ...createData, permissions: [], _count: { users: 0 } }); // findOne after create
      mockPrisma.role.create.mockResolvedValue({ id: 'role-1', ...createData });

      const result = await service.create(createData);

      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
        where: { name: 'CUSTOM_ROLE' },
      });
      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: { name: 'CUSTOM_ROLE', description: 'Un role custom' },
      });
      expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
    });

    it('should create a role with permissions', async () => {
      const createData = {
        name: 'CUSTOM_ROLE',
        description: 'Un role custom',
        permissionIds: ['perm-1', 'perm-2'],
      };
      mockPrisma.role.findUnique
        .mockResolvedValueOnce(null) // check for existing
        .mockResolvedValueOnce({ id: 'role-1', permissions: [], _count: { users: 0 } }); // findOne after create
      mockPrisma.role.create.mockResolvedValue({ id: 'role-1' });
      mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 2 });

      await service.create(createData);

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 'role-1', permissionId: 'perm-1' },
          { roleId: 'role-1', permissionId: 'perm-2' },
        ],
      });
    });

    it('should throw ConflictException when role name already exists', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ name: 'EXISTING_ROLE' }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.role.create).not.toHaveBeenCalled();
    });
  });

  // ─── FIND ALL ────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all roles with permissions and user count', async () => {
      const roles = [
        { id: '1', name: 'ADMIN', permissions: [], _count: { users: 3 } },
        { id: '2', name: 'CAISSIER', permissions: [], _count: { users: 5 } },
      ];
      mockPrisma.role.findMany.mockResolvedValue(roles);

      const result = await service.findAll();

      expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(roles);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a role by id', async () => {
      const role = { id: 'role-1', name: 'ADMIN', permissions: [], _count: { users: 2 } };
      mockPrisma.role.findUnique.mockResolvedValue(role);

      const result = await service.findOne('role-1');

      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
      });
      expect(result).toEqual(role);
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── UPDATE PERMISSIONS ─────────────────────────────────────────────────

  describe('updatePermissions', () => {
    it('should replace permissions for a role', async () => {
      const role = { id: 'role-1', name: 'CUSTOM', permissions: [], _count: { users: 0 } };
      mockPrisma.role.findUnique
        .mockResolvedValueOnce(role) // findOne check
        .mockResolvedValueOnce({ ...role, permissions: [{ permissionId: 'p1' }] }); // final findOne
      mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 2 });

      await service.updatePermissions('role-1', ['p1', 'p2']);

      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
      });
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 'role-1', permissionId: 'p1' },
          { roleId: 'role-1', permissionId: 'p2' },
        ],
      });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePermissions('non-existent', ['p1']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET ALL PERMISSIONS ───────────────────────────────────────────────

  describe('getAllPermissions', () => {
    it('should return all permissions ordered by module and action', async () => {
      const permissions = [
        { id: '1', module: 'ACCOUNTS', action: 'CREATE' },
        { id: '2', module: 'ACCOUNTS', action: 'READ' },
        { id: '3', module: 'CLIENTS', action: 'CREATE' },
      ];
      mockPrisma.permission.findMany.mockResolvedValue(permissions);

      const result = await service.getAllPermissions();

      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        orderBy: [{ module: 'asc' }, { action: 'asc' }],
      });
      expect(result).toEqual(permissions);
    });
  });

  // ─── SEED DEFAULT ROLES AND PERMISSIONS ─────────────────────────────────

  describe('seedDefaultRolesAndPermissions', () => {
    it('should create permissions and roles, returning success message', async () => {
      mockPrisma.permission.upsert.mockResolvedValue({});
      mockPrisma.permission.findMany.mockResolvedValue([
        { id: 'p1', module: 'CLIENTS', action: 'CREATE' },
        { id: 'p2', module: 'CLIENTS', action: 'READ' },
        { id: 'p3', module: 'ACCOUNTS', action: 'READ' },
      ]);
      mockPrisma.role.upsert.mockResolvedValue({ id: 'role-1' });
      mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 3 });

      const result = await service.seedDefaultRolesAndPermissions();

      expect(result.message).toBe('11 roles et 52 permissions initialises avec succes');
      // 13 modules x 4 actions = 52 permission upserts
      expect(mockPrisma.permission.upsert).toHaveBeenCalledTimes(52);
      // 10 roles seeded via upsertRoleWithPermissions (SUPER_ADMIN through DIRECTEUR_GENERAL)
      expect(mockPrisma.role.upsert).toHaveBeenCalledTimes(10);
    });
  });
});
