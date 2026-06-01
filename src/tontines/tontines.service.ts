import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateTontineGroupDto,
  AddTontineMemberDto,
  RecordTontinePaymentDto,
} from './dto/tontine.dto';
import { ContributionFrequency } from '@prisma/client';

@Injectable()
export class TontinesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==================== CREATION DU GROUPE ====================

  async createGroup(dto: CreateTontineGroupDto, userId: string) {
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const totalRounds = dto.maxMembers;

    const group = await this.prisma.tontineGroup.create({
      data: {
        name: dto.name,
        description: dto.description,
        contributionAmount: dto.contributionAmount,
        frequency: dto.frequency,
        maxMembers: dto.maxMembers,
        totalRounds,
        agencyId: dto.agencyId,
        createdById: userId,
        startDate,
        nextCollectDate: startDate,
      },
    });

    // Creer tous les rounds (sans beneficiaire pour l'instant — sera assigne quand les membres rejoignent)
    // On cree les rounds avec un beneficiaryId temporaire qui sera mis a jour
    // Note: On ne peut pas creer les rounds maintenant car on n'a pas encore de membres
    // Les rounds seront crees quand le groupe sera complet ou au fur et a mesure

    await this.auditService.log({
      userId,
      action: 'CREATE',
      module: 'TONTINES',
      entityId: group.id,
      entityType: 'TontineGroup',
      newValues: { name: dto.name, maxMembers: dto.maxMembers, contributionAmount: dto.contributionAmount },
    });

    return group;
  }

  // ==================== LISTE DES GROUPES ====================

  async findAllGroups(params: {
    agencyId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { agencyId, status, page = 1, limit = 20 } = params;
    const where: any = {};

    if (agencyId) where.agencyId = agencyId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.tontineGroup.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { members: true } },
          rounds: {
            select: { totalCollected: true },
          },
        },
      }),
      this.prisma.tontineGroup.count({ where }),
    ]);

    const groups = data.map((g) => {
      const totalCollected = g.rounds.reduce(
        (sum, r) => sum + Number(r.totalCollected),
        0,
      );
      return {
        ...g,
        memberCount: g._count.members,
        totalCollected,
        rounds: undefined,
        _count: undefined,
      };
    });

    return {
      data: groups,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ==================== DETAIL D'UN GROUPE ====================

  async findOneGroup(id: string) {
    const group = await this.prisma.tontineGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                raisonSociale: true,
                phone: true,
                clientNumber: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        rounds: {
          orderBy: { roundNumber: 'asc' },
          include: {
            payments: {
              include: {
                member: {
                  select: {
                    id: true,
                    order: true,
                    client: {
                      select: {
                        firstName: true,
                        lastName: true,
                        phone: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Groupe tontine non trouve');
    }

    return group;
  }

  // ==================== AJOUT DE MEMBRE ====================

  async addMember(groupId: string, dto: AddTontineMemberDto, userId: string) {
    const group = await this.prisma.tontineGroup.findUnique({
      where: { id: groupId },
      include: { members: { where: { isActive: true } }, rounds: true },
    });

    if (!group) {
      throw new NotFoundException('Groupe tontine non trouve');
    }

    if (group.status !== 'ACTIVE') {
      throw new BadRequestException('Le groupe n\'est pas actif');
    }

    if (group.members.length >= group.maxMembers) {
      throw new BadRequestException('Le groupe est complet');
    }

    // Verifier que le client existe
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
    });

    if (!client) {
      throw new NotFoundException('Client non trouve');
    }

    // Verifier que le client n'est pas deja membre
    const existingMember = await this.prisma.tontineMember.findUnique({
      where: { groupId_clientId: { groupId, clientId: dto.clientId } },
    });

    if (existingMember) {
      throw new ConflictException('Ce client est deja membre de ce groupe');
    }

    // Auto-assigner l'ordre si non fourni
    let order = dto.order;
    if (!order) {
      const maxOrder = group.members.reduce(
        (max, m) => Math.max(max, m.order),
        0,
      );
      order = maxOrder + 1;
    }

    // Verifier que l'ordre n'est pas deja pris
    const orderTaken = group.members.some((m) => m.order === order);
    if (orderTaken) {
      throw new ConflictException(`L'ordre ${order} est deja attribue`);
    }

    const member = await this.prisma.tontineMember.create({
      data: {
        groupId,
        clientId: dto.clientId,
        order,
      },
      include: {
        client: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    // Si des rounds existent deja, creer les paiements pour ce membre
    if (group.rounds.length > 0) {
      const paymentData = group.rounds.map((round) => ({
        roundId: round.id,
        memberId: member.id,
        amount: Number(group.contributionAmount),
        isPaid: false,
      }));

      await this.prisma.tontinePayment.createMany({ data: paymentData });
    }

    // Si le groupe est maintenant complet, generer les rounds
    const totalMembers = group.members.length + 1;
    if (totalMembers === group.maxMembers && group.rounds.length === 0) {
      await this.generateRounds(groupId, userId);
    }

    await this.auditService.log({
      userId,
      action: 'ADD_MEMBER',
      module: 'TONTINES',
      entityId: member.id,
      entityType: 'TontineMember',
      newValues: { groupId, clientId: dto.clientId, order },
    });

    return member;
  }

  // ==================== GENERATION DES ROUNDS ====================

  private async generateRounds(groupId: string, userId: string) {
    const group = await this.prisma.tontineGroup.findUnique({
      where: { id: groupId },
      include: {
        members: { where: { isActive: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!group) return;

    const startDate = group.startDate || new Date();
    const rounds: any[] = [];

    for (let i = 0; i < group.totalRounds; i++) {
      const dueDate = this.calculateDueDate(startDate, group.frequency, i);
      const beneficiary = group.members.find((m) => m.order === i + 1);

      if (!beneficiary) continue;

      rounds.push({
        groupId,
        roundNumber: i + 1,
        beneficiaryId: beneficiary.id,
        dueDate,
      });
    }

    // Creer les rounds
    for (const roundData of rounds) {
      const round = await this.prisma.tontineRound.create({ data: roundData });

      // Creer les paiements pour chaque membre actif
      const paymentData = group.members.map((member) => ({
        roundId: round.id,
        memberId: member.id,
        amount: Number(group.contributionAmount),
        isPaid: false,
      }));

      await this.prisma.tontinePayment.createMany({ data: paymentData });
    }

    // Mettre a jour la prochaine date de collecte
    if (rounds.length > 0) {
      await this.prisma.tontineGroup.update({
        where: { id: groupId },
        data: { nextCollectDate: rounds[0].dueDate },
      });
    }
  }

  private calculateDueDate(
    startDate: Date,
    frequency: ContributionFrequency,
    intervalIndex: number,
  ): Date {
    const date = new Date(startDate);
    switch (frequency) {
      case 'DAILY':
        date.setDate(date.getDate() + intervalIndex);
        break;
      case 'WEEKLY':
        date.setDate(date.getDate() + intervalIndex * 7);
        break;
      case 'MONTHLY':
        date.setMonth(date.getMonth() + intervalIndex);
        break;
    }
    return date;
  }

  // ==================== RETRAIT DE MEMBRE ====================

  async removeMember(groupId: string, memberId: string, userId: string) {
    const member = await this.prisma.tontineMember.findFirst({
      where: { id: memberId, groupId },
    });

    if (!member) {
      throw new NotFoundException('Membre non trouve dans ce groupe');
    }

    const updated = await this.prisma.tontineMember.update({
      where: { id: memberId },
      data: { isActive: false },
    });

    await this.auditService.log({
      userId,
      action: 'REMOVE_MEMBER',
      module: 'TONTINES',
      entityId: memberId,
      entityType: 'TontineMember',
      oldValues: { isActive: true },
      newValues: { isActive: false },
    });

    return updated;
  }

  // ==================== ENREGISTREMENT PAIEMENT ====================

  async recordPayment(
    groupId: string,
    roundId: string,
    dto: RecordTontinePaymentDto,
    userId: string,
  ) {
    // Verifier que le round appartient au groupe
    const round = await this.prisma.tontineRound.findFirst({
      where: { id: roundId, groupId },
      include: { group: true },
    });

    if (!round) {
      throw new NotFoundException('Tour non trouve dans ce groupe');
    }

    // Trouver le paiement pour ce round + membre
    const payment = await this.prisma.tontinePayment.findUnique({
      where: { roundId_memberId: { roundId, memberId: dto.memberId } },
    });

    if (!payment) {
      throw new NotFoundException('Paiement non trouve pour ce membre dans ce tour');
    }

    if (payment.isPaid) {
      throw new BadRequestException('Ce paiement a deja ete effectue');
    }

    const now = new Date();
    let penalty = 0;

    // Verifier le retard de paiement
    if (now > round.dueDate) {
      penalty = Math.round(Number(round.group.contributionAmount) * 0.1);
    }

    // Mettre a jour le paiement
    const updatedPayment = await this.prisma.tontinePayment.update({
      where: { id: payment.id },
      data: {
        isPaid: true,
        paidAt: now,
        amount: dto.amount,
        penalty,
      },
    });

    // Mettre a jour le total paye du membre
    await this.prisma.tontineMember.update({
      where: { id: dto.memberId },
      data: {
        totalPaid: { increment: dto.amount },
        penaltyAmount: { increment: penalty },
      },
    });

    // Mettre a jour le total collecte du round
    await this.prisma.tontineRound.update({
      where: { id: roundId },
      data: {
        totalCollected: { increment: dto.amount },
      },
    });

    await this.auditService.log({
      userId,
      action: 'RECORD_PAYMENT',
      module: 'TONTINES',
      entityId: updatedPayment.id,
      entityType: 'TontinePayment',
      newValues: {
        roundId,
        memberId: dto.memberId,
        amount: dto.amount,
        penalty,
        paidAt: now,
      },
    });

    return updatedPayment;
  }

  // ==================== DECAISSEMENT DU TOUR ====================

  async disburseRound(groupId: string, roundId: string, userId: string) {
    const round = await this.prisma.tontineRound.findFirst({
      where: { id: roundId, groupId },
      include: {
        group: {
          include: {
            members: { where: { isActive: true } },
          },
        },
        payments: true,
      },
    });

    if (!round) {
      throw new NotFoundException('Tour non trouve dans ce groupe');
    }

    if (round.isDisbursed) {
      throw new BadRequestException('Ce tour a deja ete decaisse');
    }

    // Verifier que tous les membres actifs ont paye
    const unpaidMembers = round.payments.filter(
      (p) =>
        !p.isPaid &&
        round.group.members.some((m) => m.id === p.memberId),
    );

    if (unpaidMembers.length > 0) {
      throw new BadRequestException(
        `${unpaidMembers.length} membre(s) n'ont pas encore paye pour ce tour`,
      );
    }

    // Trouver le beneficiaire (membre dont l'ordre == roundNumber)
    const beneficiary = round.group.members.find(
      (m) => m.order === round.roundNumber,
    );

    if (!beneficiary) {
      throw new BadRequestException(
        'Beneficiaire non trouve pour ce tour',
      );
    }

    const disbursedAmount = Number(round.totalCollected);
    const now = new Date();

    // Mettre a jour le round
    await this.prisma.tontineRound.update({
      where: { id: roundId },
      data: {
        isDisbursed: true,
        disbursedAt: now,
        disbursedAmount,
      },
    });

    // Mettre a jour le beneficiaire
    await this.prisma.tontineMember.update({
      where: { id: beneficiary.id },
      data: {
        totalReceived: { increment: disbursedAmount },
      },
    });

    // Mettre a jour le groupe
    const isLastRound = round.roundNumber === round.group.totalRounds;

    // Calculer la prochaine date de collecte
    let nextCollectDate: Date | null = null;
    if (!isLastRound) {
      const nextRound = await this.prisma.tontineRound.findFirst({
        where: { groupId, roundNumber: round.roundNumber + 1 },
      });
      if (nextRound) {
        nextCollectDate = nextRound.dueDate;
      }
    }

    await this.prisma.tontineGroup.update({
      where: { id: groupId },
      data: {
        currentRound: round.roundNumber,
        status: isLastRound ? 'COMPLETED' : undefined,
        nextCollectDate,
      },
    });

    await this.auditService.log({
      userId,
      action: 'DISBURSE_ROUND',
      module: 'TONTINES',
      entityId: roundId,
      entityType: 'TontineRound',
      newValues: {
        roundNumber: round.roundNumber,
        beneficiaryId: beneficiary.id,
        disbursedAmount,
        isLastRound,
      },
    });

    return {
      roundNumber: round.roundNumber,
      beneficiaryId: beneficiary.id,
      disbursedAmount,
      disbursedAt: now,
      groupCompleted: isLastRound,
    };
  }

  // ==================== STATUT DES PAIEMENTS D'UN TOUR ====================

  async getPaymentStatus(groupId: string, roundId: string) {
    const round = await this.prisma.tontineRound.findFirst({
      where: { id: roundId, groupId },
      include: {
        payments: {
          include: {
            member: {
              include: {
                client: {
                  select: {
                    firstName: true,
                    lastName: true,
                    raisonSociale: true,
                    phone: true,
                  },
                },
              },
            },
          },
          orderBy: { member: { order: 'asc' } },
        },
        group: {
          select: {
            name: true,
            contributionAmount: true,
            frequency: true,
          },
        },
      },
    });

    if (!round) {
      throw new NotFoundException('Tour non trouve dans ce groupe');
    }

    const totalMembers = round.payments.length;
    const paidCount = round.payments.filter((p) => p.isPaid).length;
    const unpaidCount = totalMembers - paidCount;

    return {
      roundId: round.id,
      roundNumber: round.roundNumber,
      dueDate: round.dueDate,
      isDisbursed: round.isDisbursed,
      groupName: round.group.name,
      contributionAmount: round.group.contributionAmount,
      totalCollected: round.totalCollected,
      totalMembers,
      paidCount,
      unpaidCount,
      payments: round.payments.map((p) => ({
        paymentId: p.id,
        memberId: p.memberId,
        memberOrder: p.member.order,
        clientName:
          p.member.client.raisonSociale ||
          `${p.member.client.firstName || ''} ${p.member.client.lastName || ''}`.trim(),
        clientPhone: p.member.client.phone,
        amount: p.amount,
        penalty: p.penalty,
        isPaid: p.isPaid,
        paidAt: p.paidAt,
      })),
    };
  }
}
