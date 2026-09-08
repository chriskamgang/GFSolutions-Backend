import { Test, TestingModule } from '@nestjs/testing';
import { SolidarityGroupsService } from './solidarity-groups.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('SolidarityGroupsService', () => {
  let service: SolidarityGroupsService;

  const mockPrisma = {
    client: {
      findUnique: jest.fn(),
    },
    agency: {
      findUnique: jest.fn(),
    },
    solidarityGroup: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    solidarityGroupMember: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolidarityGroupsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SolidarityGroupsService>(SolidarityGroupsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== CREATION ====================

  describe('create', () => {
    const createDto = {
      name: 'Groupe Solidaire A',
      code: 'GS-001',
      description: 'Un groupe test',
      agencyId: 'agency-1',
      presidentId: 'client-pres',
      treasurerId: 'client-tres',
      maxMembers: 10,
      minMembers: 3,
    };

    it('should create a group with president and treasurer', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'client-pres', clientType: 'PHYSIQUE' })
        .mockResolvedValueOnce({ id: 'client-tres', clientType: 'PHYSIQUE' });
      mockPrisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', name: 'Agence Douala' });
      const createdGroup = { id: 'grp-1', ...createDto, members: [], agency: { id: 'agency-1', name: 'Agence Douala', code: 'DLA' } };
      mockPrisma.solidarityGroup.create.mockResolvedValue(createdGroup);

      const result = await service.create(createDto);

      expect(result).toEqual(createdGroup);
      expect(mockPrisma.client.findUnique).toHaveBeenCalledTimes(2);
      expect(mockPrisma.agency.findUnique).toHaveBeenCalledWith({ where: { id: 'agency-1' } });
      expect(mockPrisma.solidarityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Groupe Solidaire A',
            code: 'GS-001',
            presidentId: 'client-pres',
            treasurerId: 'client-tres',
            maxMembers: 10,
            minMembers: 3,
          }),
        }),
      );
    });

    it('should create a group without treasurer', async () => {
      const dtoNoTreasurer = { ...createDto, treasurerId: undefined };
      mockPrisma.client.findUnique.mockResolvedValueOnce({ id: 'client-pres', clientType: 'PHYSIQUE' });
      mockPrisma.agency.findUnique.mockResolvedValue({ id: 'agency-1' });
      mockPrisma.solidarityGroup.create.mockResolvedValue({ id: 'grp-2', ...dtoNoTreasurer });

      const result = await service.create(dtoNoTreasurer);

      expect(result.id).toBe('grp-2');
      expect(mockPrisma.client.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when president does not exist', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when president is not PHYSIQUE', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-pres', clientType: 'MORALE' });

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(createDto)).rejects.toThrow('Le président doit être une Personne Physique');
    });

    it('should throw NotFoundException when treasurer does not exist', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'client-pres', clientType: 'PHYSIQUE' })
        .mockResolvedValueOnce(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when treasurer is not PHYSIQUE', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'client-pres', clientType: 'PHYSIQUE' })
        .mockResolvedValueOnce({ id: 'client-tres', clientType: 'MORALE' });

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);

      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'client-pres', clientType: 'PHYSIQUE' })
        .mockResolvedValueOnce({ id: 'client-tres', clientType: 'MORALE' });

      await expect(service.create(createDto)).rejects.toThrow('Le trésorier doit être une Personne Physique');
    });

    it('should throw NotFoundException when agency does not exist', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'client-pres', clientType: 'PHYSIQUE' })
        .mockResolvedValueOnce({ id: 'client-tres', clientType: 'PHYSIQUE' });
      mockPrisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should default maxMembers to 10 and minMembers to 3 when not provided', async () => {
      const dtoDefaults = { name: 'G1', code: 'C1', agencyId: 'a1', presidentId: 'p1' };
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'p1', clientType: 'PHYSIQUE' });
      mockPrisma.agency.findUnique.mockResolvedValue({ id: 'a1' });
      mockPrisma.solidarityGroup.create.mockResolvedValue({ id: 'g1' });

      await service.create(dtoDefaults);

      expect(mockPrisma.solidarityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            maxMembers: 10,
            minMembers: 3,
          }),
        }),
      );
    });
  });

  // ==================== LISTE ====================

  describe('findAll', () => {
    it('should return all groups with memberCount', async () => {
      const groups = [
        { id: 'g1', name: 'G1', members: [{ id: 'm1' }, { id: 'm2' }], agency: { id: 'a1', name: 'A1', code: 'A' } },
        { id: 'g2', name: 'G2', members: [], agency: { id: 'a2', name: 'A2', code: 'B' } },
      ];
      mockPrisma.solidarityGroup.findMany.mockResolvedValue(groups);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].memberCount).toBe(2);
      expect(result[1].memberCount).toBe(0);
    });

    it('should filter by agencyId when provided', async () => {
      mockPrisma.solidarityGroup.findMany.mockResolvedValue([]);

      await service.findAll('agency-1');

      expect(mockPrisma.solidarityGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agencyId: 'agency-1' },
        }),
      );
    });

    it('should not filter when no agencyId is provided', async () => {
      mockPrisma.solidarityGroup.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(mockPrisma.solidarityGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: undefined,
        }),
      );
    });
  });

  // ==================== DETAIL ====================

  describe('findOne', () => {
    it('should return a group by id', async () => {
      const group = { id: 'g1', name: 'G1', members: [], agency: { id: 'a1' } };
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue(group);

      const result = await service.findOne('g1');

      expect(result).toEqual(group);
      expect(mockPrisma.solidarityGroup.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'g1' } }),
      );
    });

    it('should throw NotFoundException when group does not exist', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== AJOUT MEMBRE ====================

  describe('addMember', () => {
    it('should add a new member to an active group', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({
        id: 'g1', status: 'ACTIVE', maxMembers: 10,
        members: [{ id: 'm1' }],
      });
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', clientType: 'PHYSIQUE' });
      mockPrisma.solidarityGroupMember.findUnique.mockResolvedValue(null);
      const newMember = { id: 'mem-1', groupId: 'g1', clientId: 'c1', role: 'MEMBER', client: { id: 'c1' } };
      mockPrisma.solidarityGroupMember.create.mockResolvedValue(newMember);

      const result = await service.addMember('g1', 'c1');

      expect(result).toEqual(newMember);
      expect(mockPrisma.solidarityGroupMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { groupId: 'g1', clientId: 'c1', role: 'MEMBER' },
        }),
      );
    });

    it('should add a member with a specific role', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({
        id: 'g1', status: 'ACTIVE', maxMembers: 10, members: [],
      });
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c2', clientType: 'PHYSIQUE' });
      mockPrisma.solidarityGroupMember.findUnique.mockResolvedValue(null);
      mockPrisma.solidarityGroupMember.create.mockResolvedValue({ id: 'mem-2', role: 'SECRETARY' });

      await service.addMember('g1', 'c2', 'SECRETARY');

      expect(mockPrisma.solidarityGroupMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { groupId: 'g1', clientId: 'c2', role: 'SECRETARY' },
        }),
      );
    });

    it('should reactivate a former member', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({
        id: 'g1', status: 'ACTIVE', maxMembers: 10, members: [],
      });
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', clientType: 'PHYSIQUE' });
      mockPrisma.solidarityGroupMember.findUnique.mockResolvedValue({ id: 'mem-old', isActive: false });
      mockPrisma.solidarityGroupMember.update.mockResolvedValue({ id: 'mem-old', isActive: true, role: 'MEMBER' });

      const result = await service.addMember('g1', 'c1');

      expect(result.isActive).toBe(true);
      expect(mockPrisma.solidarityGroupMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true, leftAt: null }),
        }),
      );
    });

    it('should throw NotFoundException when group does not exist', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue(null);

      await expect(service.addMember('invalid', 'c1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when group is not ACTIVE', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({
        id: 'g1', status: 'SUSPENDED', maxMembers: 10, members: [],
      });

      await expect(service.addMember('g1', 'c1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when group is at max capacity', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({
        id: 'g1', status: 'ACTIVE', maxMembers: 2,
        members: [{ id: 'm1' }, { id: 'm2' }],
      });

      await expect(service.addMember('g1', 'c1')).rejects.toThrow(BadRequestException);
      await expect(service.addMember('g1', 'c1')).rejects.toThrow('maximum');
    });

    it('should throw NotFoundException when client does not exist', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({
        id: 'g1', status: 'ACTIVE', maxMembers: 10, members: [],
      });
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.addMember('g1', 'invalid')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when client is not PHYSIQUE', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({
        id: 'g1', status: 'ACTIVE', maxMembers: 10, members: [],
      });
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', clientType: 'MORALE' });

      await expect(service.addMember('g1', 'c1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when client is already an active member', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({
        id: 'g1', status: 'ACTIVE', maxMembers: 10, members: [],
      });
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', clientType: 'PHYSIQUE' });
      mockPrisma.solidarityGroupMember.findUnique.mockResolvedValue({ id: 'mem-1', isActive: true });

      await expect(service.addMember('g1', 'c1')).rejects.toThrow(ConflictException);
    });
  });

  // ==================== RETRAIT MEMBRE ====================

  describe('removeMember', () => {
    it('should deactivate an active member', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', presidentId: 'pres-1' });
      mockPrisma.solidarityGroupMember.findUnique.mockResolvedValue({ id: 'mem-1', isActive: true });
      mockPrisma.solidarityGroupMember.update.mockResolvedValue({ id: 'mem-1', isActive: false });

      const result = await service.removeMember('g1', 'c1');

      expect(result.isActive).toBe(false);
      expect(mockPrisma.solidarityGroupMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('should throw NotFoundException when group does not exist', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue(null);

      await expect(service.removeMember('invalid', 'c1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to remove the president', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', presidentId: 'pres-1' });

      await expect(service.removeMember('g1', 'pres-1')).rejects.toThrow(BadRequestException);
      await expect(service.removeMember('g1', 'pres-1')).rejects.toThrow('président');
    });

    it('should throw NotFoundException when member is not active', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', presidentId: 'pres-1' });
      mockPrisma.solidarityGroupMember.findUnique.mockResolvedValue(null);

      await expect(service.removeMember('g1', 'c1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when member exists but is inactive', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', presidentId: 'pres-1' });
      mockPrisma.solidarityGroupMember.findUnique.mockResolvedValue({ id: 'mem-1', isActive: false });

      await expect(service.removeMember('g1', 'c1')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== SUSPENSION ====================

  describe('suspend', () => {
    it('should suspend an active group', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', status: 'ACTIVE' });
      mockPrisma.solidarityGroup.update.mockResolvedValue({ id: 'g1', status: 'SUSPENDED' });

      const result = await service.suspend('g1');

      expect(result.status).toBe('SUSPENDED');
      expect(mockPrisma.solidarityGroup.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { status: 'SUSPENDED' },
      });
    });

    it('should throw NotFoundException when group does not exist', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue(null);

      await expect(service.suspend('invalid')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when group is not ACTIVE', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', status: 'DISSOLVED' });

      await expect(service.suspend('g1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== REACTIVATION ====================

  describe('reactivate', () => {
    it('should reactivate a suspended group', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', status: 'SUSPENDED' });
      mockPrisma.solidarityGroup.update.mockResolvedValue({ id: 'g1', status: 'ACTIVE' });

      const result = await service.reactivate('g1');

      expect(result.status).toBe('ACTIVE');
    });

    it('should throw NotFoundException when group does not exist', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue(null);

      await expect(service.reactivate('invalid')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when group is not SUSPENDED', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', status: 'ACTIVE' });

      await expect(service.reactivate('g1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== DISSOLUTION ====================

  describe('dissolve', () => {
    it('should dissolve a group', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', status: 'ACTIVE' });
      mockPrisma.solidarityGroup.update.mockResolvedValue({ id: 'g1', status: 'DISSOLVED' });

      const result = await service.dissolve('g1');

      expect(result.status).toBe('DISSOLVED');
      expect(mockPrisma.solidarityGroup.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { status: 'DISSOLVED' },
      });
    });

    it('should throw NotFoundException when group does not exist', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue(null);

      await expect(service.dissolve('invalid')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when group is already dissolved', async () => {
      mockPrisma.solidarityGroup.findUnique.mockResolvedValue({ id: 'g1', status: 'DISSOLVED' });

      await expect(service.dissolve('g1')).rejects.toThrow(BadRequestException);
      await expect(service.dissolve('g1')).rejects.toThrow('déjà dissous');
    });
  });
});
