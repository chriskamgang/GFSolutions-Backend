import { Test, TestingModule } from '@nestjs/testing';
import { TontinesService } from './tontines.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('TontinesService', () => {
  let service: TontinesService;

  const mockPrisma = {
    tontineGroup: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    tontineMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tontineRound: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tontinePayment: {
      findUnique: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TontinesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<TontinesService>(TontinesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== CREATION DU GROUPE ====================

  describe('createGroup', () => {
    const dto = {
      name: 'Tontine Douala',
      contributionAmount: 50000,
      frequency: 'MONTHLY' as const,
      maxMembers: 10,
      agencyId: 'agency-1',
    };

    it('should create a tontine group', async () => {
      const group = { id: 'grp-1', ...dto, totalRounds: 10 };
      mockPrisma.tontineGroup.create.mockResolvedValue(group);

      const result = await service.createGroup(dto as any, 'user-1');

      expect(result).toEqual(group);
      expect(mockPrisma.tontineGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: dto.name,
          contributionAmount: dto.contributionAmount,
          frequency: dto.frequency,
          maxMembers: dto.maxMembers,
          totalRounds: dto.maxMembers,
          agencyId: dto.agencyId,
          createdById: 'user-1',
        }),
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', module: 'TONTINES' }),
      );
    });

    it('should use provided startDate when given', async () => {
      const dtoWithDate = { ...dto, startDate: '2026-09-01' };
      mockPrisma.tontineGroup.create.mockResolvedValue({ id: 'grp-2' });

      await service.createGroup(dtoWithDate as any, 'user-1');

      expect(mockPrisma.tontineGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          startDate: new Date('2026-09-01'),
          nextCollectDate: new Date('2026-09-01'),
        }),
      });
    });
  });

  // ==================== LISTE DES GROUPES ====================

  describe('findAllGroups', () => {
    it('should return paginated groups with computed fields', async () => {
      const rawGroups = [
        {
          id: 'grp-1',
          name: 'Test',
          _count: { members: 5 },
          rounds: [
            { totalCollected: 100000 },
            { totalCollected: 50000 },
          ],
        },
      ];
      mockPrisma.tontineGroup.findMany.mockResolvedValue(rawGroups);
      mockPrisma.tontineGroup.count.mockResolvedValue(1);

      const result = await service.findAllGroups({ page: 1, limit: 20 });

      expect(result.data[0].memberCount).toBe(5);
      expect(result.data[0].totalCollected).toBe(150000);
      expect(result.data[0].rounds).toBeUndefined();
      expect(result.data[0]._count).toBeUndefined();
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should apply filters', async () => {
      mockPrisma.tontineGroup.findMany.mockResolvedValue([]);
      mockPrisma.tontineGroup.count.mockResolvedValue(0);

      await service.findAllGroups({ agencyId: 'a1', status: 'ACTIVE' });

      expect(mockPrisma.tontineGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agencyId: 'a1', status: 'ACTIVE' },
        }),
      );
    });
  });

  // ==================== DETAIL D'UN GROUPE ====================

  describe('findOneGroup', () => {
    it('should return a group with members and rounds', async () => {
      const group = { id: 'grp-1', members: [], rounds: [] };
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(group);

      const result = await service.findOneGroup('grp-1');

      expect(result).toEqual(group);
    });

    it('should throw NotFoundException if group not found', async () => {
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(null);

      await expect(service.findOneGroup('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== AJOUT DE MEMBRE ====================

  describe('addMember', () => {
    const dto = { clientId: 'client-1' };

    const group = {
      id: 'grp-1',
      status: 'ACTIVE',
      maxMembers: 5,
      contributionAmount: 50000,
      members: [
        { id: 'm1', order: 1, isActive: true },
        { id: 'm2', order: 2, isActive: true },
      ],
      rounds: [],
    };

    it('should add a member with auto-assigned order', async () => {
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(group);
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.tontineMember.findUnique.mockResolvedValue(null);
      const member = { id: 'new-m', order: 3, client: { firstName: 'Test' } };
      mockPrisma.tontineMember.create.mockResolvedValue(member);

      const result = await service.addMember('grp-1', dto as any, 'user-1');

      expect(result).toEqual(member);
      expect(mockPrisma.tontineMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ groupId: 'grp-1', clientId: 'client-1', order: 3 }),
        }),
      );
    });

    it('should use provided order', async () => {
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(group);
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.tontineMember.findUnique.mockResolvedValue(null);
      mockPrisma.tontineMember.create.mockResolvedValue({ id: 'new-m', order: 5 });

      await service.addMember('grp-1', { ...dto, order: 5 } as any, 'user-1');

      expect(mockPrisma.tontineMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 5 }),
        }),
      );
    });

    it('should throw NotFoundException if group not found', async () => {
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(null);

      await expect(service.addMember('missing', dto as any, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if group is not active', async () => {
      mockPrisma.tontineGroup.findUnique.mockResolvedValue({ ...group, status: 'COMPLETED' });

      await expect(service.addMember('grp-1', dto as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if group is full', async () => {
      const fullGroup = {
        ...group,
        maxMembers: 2,
        members: [{ id: 'm1', order: 1 }, { id: 'm2', order: 2 }],
      };
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(fullGroup);

      await expect(service.addMember('grp-1', dto as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if client not found', async () => {
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(group);
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.addMember('grp-1', dto as any, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if client is already a member', async () => {
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(group);
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.tontineMember.findUnique.mockResolvedValue({ id: 'existing-member' });

      await expect(service.addMember('grp-1', dto as any, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if order is already taken', async () => {
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(group);
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.tontineMember.findUnique.mockResolvedValue(null);

      await expect(
        service.addMember('grp-1', { clientId: 'client-1', order: 1 } as any, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should create payments for existing rounds when adding member', async () => {
      const groupWithRounds = {
        ...group,
        rounds: [{ id: 'r1' }, { id: 'r2' }],
      };
      mockPrisma.tontineGroup.findUnique.mockResolvedValue(groupWithRounds);
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      mockPrisma.tontineMember.findUnique.mockResolvedValue(null);
      mockPrisma.tontineMember.create.mockResolvedValue({ id: 'new-m', order: 3 });
      mockPrisma.tontinePayment.createMany.mockResolvedValue({ count: 2 });

      await service.addMember('grp-1', dto as any, 'user-1');

      expect(mockPrisma.tontinePayment.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ roundId: 'r1', memberId: 'new-m' }),
          expect.objectContaining({ roundId: 'r2', memberId: 'new-m' }),
        ]),
      });
    });
  });

  // ==================== RETRAIT DE MEMBRE ====================

  describe('removeMember', () => {
    it('should deactivate a member', async () => {
      mockPrisma.tontineMember.findFirst.mockResolvedValue({ id: 'm1', groupId: 'grp-1' });
      mockPrisma.tontineMember.update.mockResolvedValue({ id: 'm1', isActive: false });

      const result = await service.removeMember('grp-1', 'm1', 'user-1');

      expect(result.isActive).toBe(false);
      expect(mockPrisma.tontineMember.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { isActive: false },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REMOVE_MEMBER' }),
      );
    });

    it('should throw NotFoundException if member not found in group', async () => {
      mockPrisma.tontineMember.findFirst.mockResolvedValue(null);

      await expect(service.removeMember('grp-1', 'missing', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== ENREGISTREMENT PAIEMENT ====================

  describe('recordPayment', () => {
    const dto = { memberId: 'm1', amount: 50000 };

    const round = {
      id: 'r1',
      groupId: 'grp-1',
      dueDate: new Date(Date.now() + 86400000), // tomorrow
      group: { contributionAmount: 50000 },
    };

    it('should record a payment', async () => {
      mockPrisma.tontineRound.findFirst.mockResolvedValue(round);
      mockPrisma.tontinePayment.findUnique.mockResolvedValue({
        id: 'pay-1',
        isPaid: false,
      });
      const updatedPayment = { id: 'pay-1', isPaid: true, amount: 50000, penalty: 0 };
      mockPrisma.tontinePayment.update.mockResolvedValue(updatedPayment);
      mockPrisma.tontineMember.update.mockResolvedValue({});
      mockPrisma.tontineRound.update.mockResolvedValue({});

      const result = await service.recordPayment('grp-1', 'r1', dto as any, 'user-1');

      expect(result).toEqual(updatedPayment);
      expect(mockPrisma.tontineMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            totalPaid: { increment: 50000 },
            penaltyAmount: { increment: 0 },
          },
        }),
      );
    });

    it('should apply penalty for late payment', async () => {
      const pastDueRound = {
        ...round,
        dueDate: new Date(Date.now() - 86400000), // yesterday
      };
      mockPrisma.tontineRound.findFirst.mockResolvedValue(pastDueRound);
      mockPrisma.tontinePayment.findUnique.mockResolvedValue({ id: 'pay-1', isPaid: false });
      mockPrisma.tontinePayment.update.mockResolvedValue({ id: 'pay-1', penalty: 5000 });
      mockPrisma.tontineMember.update.mockResolvedValue({});
      mockPrisma.tontineRound.update.mockResolvedValue({});

      await service.recordPayment('grp-1', 'r1', dto as any, 'user-1');

      expect(mockPrisma.tontinePayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ penalty: 5000 }),
        }),
      );
    });

    it('should throw NotFoundException if round not found', async () => {
      mockPrisma.tontineRound.findFirst.mockResolvedValue(null);

      await expect(service.recordPayment('grp-1', 'missing', dto as any, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if payment not found for member', async () => {
      mockPrisma.tontineRound.findFirst.mockResolvedValue(round);
      mockPrisma.tontinePayment.findUnique.mockResolvedValue(null);

      await expect(service.recordPayment('grp-1', 'r1', dto as any, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if payment already made', async () => {
      mockPrisma.tontineRound.findFirst.mockResolvedValue(round);
      mockPrisma.tontinePayment.findUnique.mockResolvedValue({ id: 'pay-1', isPaid: true });

      await expect(service.recordPayment('grp-1', 'r1', dto as any, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==================== DECAISSEMENT DU TOUR ====================

  describe('disburseRound', () => {
    const round = {
      id: 'r1',
      groupId: 'grp-1',
      roundNumber: 1,
      isDisbursed: false,
      totalCollected: 250000,
      group: {
        totalRounds: 5,
        members: [
          { id: 'm1', order: 1, isActive: true },
          { id: 'm2', order: 2, isActive: true },
        ],
      },
      payments: [
        { id: 'p1', isPaid: true, memberId: 'm1' },
        { id: 'p2', isPaid: true, memberId: 'm2' },
      ],
    };

    it('should disburse a round to the beneficiary', async () => {
      mockPrisma.tontineRound.findFirst
        .mockResolvedValueOnce(round) // disburseRound call
        .mockResolvedValueOnce({ id: 'r2', dueDate: new Date() }); // next round lookup
      mockPrisma.tontineRound.update.mockResolvedValue({});
      mockPrisma.tontineMember.update.mockResolvedValue({});
      mockPrisma.tontineGroup.update.mockResolvedValue({});

      const result = await service.disburseRound('grp-1', 'r1', 'user-1');

      expect(result.roundNumber).toBe(1);
      expect(result.beneficiaryId).toBe('m1');
      expect(result.disbursedAmount).toBe(250000);
      expect(result.groupCompleted).toBe(false);
    });

    it('should mark group as completed on last round', async () => {
      const lastRound = {
        ...round,
        roundNumber: 5,
        group: { ...round.group, totalRounds: 5 },
      };
      mockPrisma.tontineRound.findFirst.mockResolvedValue(lastRound);
      mockPrisma.tontineRound.update.mockResolvedValue({});
      // beneficiary for round 5 is m2 (order === 5 doesn't exist), need to adjust
      const lastRoundWithBeneficiary = {
        ...lastRound,
        group: {
          ...lastRound.group,
          members: [
            ...lastRound.group.members,
            { id: 'm5', order: 5, isActive: true },
          ],
        },
      };
      mockPrisma.tontineRound.findFirst.mockResolvedValue(lastRoundWithBeneficiary);
      mockPrisma.tontineMember.update.mockResolvedValue({});
      mockPrisma.tontineGroup.update.mockResolvedValue({});

      const result = await service.disburseRound('grp-1', 'r1', 'user-1');

      expect(result.groupCompleted).toBe(true);
      expect(mockPrisma.tontineGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('should throw NotFoundException if round not found', async () => {
      mockPrisma.tontineRound.findFirst.mockResolvedValue(null);

      await expect(service.disburseRound('grp-1', 'missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if round already disbursed', async () => {
      mockPrisma.tontineRound.findFirst.mockResolvedValue({ ...round, isDisbursed: true });

      await expect(service.disburseRound('grp-1', 'r1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if not all members have paid', async () => {
      const unpaidRound = {
        ...round,
        payments: [
          { id: 'p1', isPaid: true, memberId: 'm1' },
          { id: 'p2', isPaid: false, memberId: 'm2' },
        ],
      };
      mockPrisma.tontineRound.findFirst.mockResolvedValue(unpaidRound);

      await expect(service.disburseRound('grp-1', 'r1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==================== STATUT DES PAIEMENTS ====================

  describe('getPaymentStatus', () => {
    it('should return payment status summary for a round', async () => {
      const round = {
        id: 'r1',
        roundNumber: 1,
        dueDate: new Date(),
        isDisbursed: false,
        totalCollected: 100000,
        group: {
          name: 'Tontine Test',
          contributionAmount: 50000,
          frequency: 'MONTHLY',
        },
        payments: [
          {
            id: 'p1',
            memberId: 'm1',
            amount: 50000,
            penalty: 0,
            isPaid: true,
            paidAt: new Date(),
            member: {
              order: 1,
              client: { firstName: 'Jean', lastName: 'Dupont', raisonSociale: null, phone: '+237600' },
            },
          },
          {
            id: 'p2',
            memberId: 'm2',
            amount: 50000,
            penalty: 0,
            isPaid: false,
            paidAt: null,
            member: {
              order: 2,
              client: { firstName: 'Marie', lastName: 'Martin', raisonSociale: null, phone: '+237601' },
            },
          },
        ],
      };
      mockPrisma.tontineRound.findFirst.mockResolvedValue(round);

      const result = await service.getPaymentStatus('grp-1', 'r1');

      expect(result.totalMembers).toBe(2);
      expect(result.paidCount).toBe(1);
      expect(result.unpaidCount).toBe(1);
      expect(result.groupName).toBe('Tontine Test');
      expect(result.payments).toHaveLength(2);
      expect(result.payments[0].clientName).toBe('Jean Dupont');
    });

    it('should use raisonSociale when available', async () => {
      const round = {
        id: 'r1',
        roundNumber: 1,
        dueDate: new Date(),
        isDisbursed: false,
        totalCollected: 50000,
        group: { name: 'Test', contributionAmount: 50000, frequency: 'MONTHLY' },
        payments: [
          {
            id: 'p1',
            memberId: 'm1',
            amount: 50000,
            penalty: 0,
            isPaid: true,
            paidAt: new Date(),
            member: {
              order: 1,
              client: { firstName: 'Jean', lastName: 'Dupont', raisonSociale: 'Entreprise ABC', phone: '+237600' },
            },
          },
        ],
      };
      mockPrisma.tontineRound.findFirst.mockResolvedValue(round);

      const result = await service.getPaymentStatus('grp-1', 'r1');

      expect(result.payments[0].clientName).toBe('Entreprise ABC');
    });

    it('should throw NotFoundException if round not found', async () => {
      mockPrisma.tontineRound.findFirst.mockResolvedValue(null);

      await expect(service.getPaymentStatus('grp-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
