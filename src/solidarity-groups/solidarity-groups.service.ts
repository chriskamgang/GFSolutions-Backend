import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SolidarityGroupsService {
  constructor(private prisma: PrismaService) {}

  // ==================== CREATION ====================

  async create(data: {
    name: string;
    code: string;
    description?: string;
    agencyId: string;
    presidentId: string;
    treasurerId?: string;
    maxMembers?: number;
    minMembers?: number;
  }) {
    // Verify president exists and is a PHYSIQUE client
    const president = await this.prisma.client.findUnique({
      where: { id: data.presidentId },
    });
    if (!president) {
      throw new NotFoundException(`Client président introuvable (id: ${data.presidentId})`);
    }
    if (president.clientType !== 'PHYSIQUE') {
      throw new BadRequestException('Le président doit être une Personne Physique');
    }

    // Verify treasurer if provided
    if (data.treasurerId) {
      const treasurer = await this.prisma.client.findUnique({
        where: { id: data.treasurerId },
      });
      if (!treasurer) {
        throw new NotFoundException(`Client trésorier introuvable (id: ${data.treasurerId})`);
      }
      if (treasurer.clientType !== 'PHYSIQUE') {
        throw new BadRequestException('Le trésorier doit être une Personne Physique');
      }
    }

    // Verify agency exists
    const agency = await this.prisma.agency.findUnique({
      where: { id: data.agencyId },
    });
    if (!agency) {
      throw new NotFoundException(`Agence introuvable (id: ${data.agencyId})`);
    }

    // Create group with president as first member
    const group = await this.prisma.solidarityGroup.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        agencyId: data.agencyId,
        presidentId: data.presidentId,
        treasurerId: data.treasurerId,
        maxMembers: data.maxMembers ?? 10,
        minMembers: data.minMembers ?? 3,
        members: {
          create: [
            {
              clientId: data.presidentId,
              role: 'PRESIDENT',
            },
            ...(data.treasurerId && data.treasurerId !== data.presidentId
              ? [{ clientId: data.treasurerId, role: 'TREASURER' }]
              : []),
          ],
        },
      },
      include: {
        members: {
          include: {
            client: {
              select: {
                id: true,
                clientNumber: true,
                firstName: true,
                lastName: true,
                phone: true,
                clientType: true,
              },
            },
          },
        },
        agency: { select: { id: true, name: true, code: true } },
      },
    });

    return group;
  }

  // ==================== LISTE ====================

  async findAll(agencyId?: string) {
    const groups = await this.prisma.solidarityGroup.findMany({
      where: agencyId ? { agencyId } : undefined,
      include: {
        agency: { select: { id: true, name: true, code: true } },
        members: {
          where: { isActive: true },
          include: {
            client: {
              select: {
                id: true,
                clientNumber: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return groups.map((g) => ({
      ...g,
      memberCount: g.members.length,
    }));
  }

  // ==================== DETAIL ====================

  async findOne(id: string) {
    const group = await this.prisma.solidarityGroup.findUnique({
      where: { id },
      include: {
        agency: { select: { id: true, name: true, code: true } },
        members: {
          include: {
            client: {
              select: {
                id: true,
                clientNumber: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
                profession: true,
                clientType: true,
                status: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Groupe solidaire introuvable (id: ${id})`);
    }

    return group;
  }

  // ==================== AJOUT MEMBRE ====================

  async addMember(
    groupId: string,
    clientId: string,
    role: string = 'MEMBER',
  ) {
    const group = await this.prisma.solidarityGroup.findUnique({
      where: { id: groupId },
      include: {
        members: { where: { isActive: true } },
      },
    });

    if (!group) {
      throw new NotFoundException(`Groupe solidaire introuvable (id: ${groupId})`);
    }

    if (group.status !== 'ACTIVE') {
      throw new BadRequestException(`Impossible d'ajouter un membre : le groupe est ${group.status}`);
    }

    if (group.members.length >= group.maxMembers) {
      throw new BadRequestException(
        `Le groupe a atteint son maximum de ${group.maxMembers} membres`,
      );
    }

    // Verify client exists and is PHYSIQUE
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Client introuvable (id: ${clientId})`);
    }
    if (client.clientType !== 'PHYSIQUE') {
      throw new BadRequestException('Seules les Personnes Physiques peuvent rejoindre un groupe solidaire');
    }

    // Check if already a member
    const existing = await this.prisma.solidarityGroupMember.findUnique({
      where: { groupId_clientId: { groupId, clientId } },
    });
    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('Ce client est déjà membre du groupe');
      }
      // Reactivate former member
      return this.prisma.solidarityGroupMember.update({
        where: { id: existing.id },
        data: { isActive: true, leftAt: null, role },
        include: {
          client: {
            select: {
              id: true,
              clientNumber: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      });
    }

    return this.prisma.solidarityGroupMember.create({
      data: { groupId, clientId, role },
      include: {
        client: {
          select: {
            id: true,
            clientNumber: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  // ==================== RETRAIT MEMBRE ====================

  async removeMember(groupId: string, clientId: string) {
    const group = await this.prisma.solidarityGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException(`Groupe solidaire introuvable (id: ${groupId})`);
    }

    if (group.presidentId === clientId) {
      throw new BadRequestException('Impossible de retirer le président du groupe. Changez d\'abord le président.');
    }

    const member = await this.prisma.solidarityGroupMember.findUnique({
      where: { groupId_clientId: { groupId, clientId } },
    });
    if (!member || !member.isActive) {
      throw new NotFoundException('Ce client n\'est pas membre actif du groupe');
    }

    return this.prisma.solidarityGroupMember.update({
      where: { id: member.id },
      data: { isActive: false, leftAt: new Date() },
    });
  }

  // ==================== DISSOLUTION ====================

  async dissolve(groupId: string) {
    const group = await this.prisma.solidarityGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException(`Groupe solidaire introuvable (id: ${groupId})`);
    }

    if (group.status === 'DISSOLVED') {
      throw new BadRequestException('Le groupe est déjà dissous');
    }

    return this.prisma.solidarityGroup.update({
      where: { id: groupId },
      data: { status: 'DISSOLVED' },
    });
  }

  // ==================== SUSPENSION / REACTIVATION ====================

  async suspend(groupId: string) {
    const group = await this.prisma.solidarityGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException(`Groupe solidaire introuvable (id: ${groupId})`);
    }
    if (group.status !== 'ACTIVE') {
      throw new BadRequestException(`Le groupe ne peut pas être suspendu (statut: ${group.status})`);
    }
    return this.prisma.solidarityGroup.update({
      where: { id: groupId },
      data: { status: 'SUSPENDED' },
    });
  }

  async reactivate(groupId: string) {
    const group = await this.prisma.solidarityGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException(`Groupe solidaire introuvable (id: ${groupId})`);
    }
    if (group.status !== 'SUSPENDED') {
      throw new BadRequestException(`Le groupe ne peut pas être réactivé (statut: ${group.status})`);
    }
    return this.prisma.solidarityGroup.update({
      where: { id: groupId },
      data: { status: 'ACTIVE' },
    });
  }
}
