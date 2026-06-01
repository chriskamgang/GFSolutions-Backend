import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSavingsGoalDto, UpdateSavingsGoalDto, ContributeToGoalDto } from './dto/savings-goal.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SavingsGoalsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
  ) {}

  // ==================== CREATION ====================

  async create(dto: CreateSavingsGoalDto, userId?: string) {
    // Verifier que le client existe
    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
    });
    if (!client) {
      throw new NotFoundException('Client non trouve');
    }

    // Verifier que le compte epargne existe et appartient au client
    const savingsAccount = await this.prisma.savingsAccount.findUnique({
      where: { id: dto.savingsAccountId },
    });
    if (!savingsAccount) {
      throw new NotFoundException('Compte epargne non trouve');
    }
    if (savingsAccount.clientId !== dto.clientId) {
      throw new BadRequestException('Ce compte epargne n\'appartient pas a ce client');
    }

    const goal = await this.prisma.savingsGoal.create({
      data: {
        clientId: dto.clientId,
        savingsAccountId: dto.savingsAccountId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        targetDate: new Date(dto.targetDate),
        autoDebit: dto.autoDebit ?? false,
        autoDebitAmount: dto.autoDebitAmount,
        autoDebitFrequency: dto.autoDebitFrequency,
        bonusRate: dto.bonusRate ?? 0,
      },
      include: { client: true, savingsAccount: true },
    });

    // Audit
    if (userId) {
      this.auditService.log({
        userId,
        action: 'CREATE',
        module: 'SAVINGS_GOALS',
        entityId: goal.id,
        entityType: 'SavingsGoal',
        details: `Creation objectif epargne "${dto.name}" - Cible ${dto.targetAmount} FCFA`,
      }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return goal;
  }

  // ==================== LISTE ====================

  async findAll(params: {
    clientId?: string;
    isCompleted?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { clientId, isCompleted, page = 1, limit = 20 } = params;

    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (isCompleted !== undefined) where.isCompleted = isCompleted;

    const [goals, total] = await Promise.all([
      this.prisma.savingsGoal.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, clientNumber: true } },
          savingsAccount: { select: { id: true, accountNumber: true, balance: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.savingsGoal.count({ where }),
    ]);

    return {
      data: goals,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==================== DETAIL ====================

  async findOne(id: string) {
    const goal = await this.prisma.savingsGoal.findUnique({
      where: { id },
      include: {
        client: true,
        savingsAccount: { include: { product: true } },
      },
    });
    if (!goal) {
      throw new NotFoundException('Objectif epargne non trouve');
    }

    const percentage = Number(goal.targetAmount) > 0
      ? Math.min(100, Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100))
      : 0;

    return { ...goal, percentage };
  }

  // ==================== CONTRIBUTION ====================

  async contribute(id: string, dto: ContributeToGoalDto, userId?: string) {
    const goal = await this.prisma.savingsGoal.findUnique({
      where: { id },
      include: { savingsAccount: true, client: true },
    });
    if (!goal) {
      throw new NotFoundException('Objectif epargne non trouve');
    }
    if (goal.isCompleted) {
      throw new BadRequestException('Cet objectif est deja atteint');
    }

    const targetAmount = Number(goal.targetAmount);
    const previousAmount = Number(goal.currentAmount);
    const newAmount = previousAmount + dto.amount;
    const newBalance = Number(goal.savingsAccount.balance) + dto.amount;

    return this.prisma.$transaction(async (tx) => {
      // 1. Mettre a jour le montant courant de l'objectif
      const isCompleted = newAmount >= targetAmount;

      await tx.savingsGoal.update({
        where: { id },
        data: {
          currentAmount: newAmount,
          isCompleted,
          completedAt: isCompleted ? new Date() : undefined,
        },
      });

      // 2. Creer une contribution sur le compte epargne lie
      await tx.savingsContribution.create({
        data: {
          savingsAccountId: goal.savingsAccountId,
          type: 'DEPOSIT',
          amount: dto.amount,
          balanceAfter: newBalance,
          description: `Epargne objectif: ${goal.name}`,
        },
      });

      // 3. Mettre a jour le solde du compte epargne
      await tx.savingsAccount.update({
        where: { id: goal.savingsAccountId },
        data: {
          balance: newBalance,
          totalDeposits: { increment: dto.amount },
        },
      });

      // 4. Verifier les jalons (milestones) et creer des notifications
      const previousPercentage = targetAmount > 0
        ? Math.floor((previousAmount / targetAmount) * 100)
        : 0;
      const newPercentage = targetAmount > 0
        ? Math.floor((newAmount / targetAmount) * 100)
        : 0;

      const milestones = [25, 50, 75, 100];
      for (const milestone of milestones) {
        if (previousPercentage < milestone && newPercentage >= milestone) {
          const title = milestone === 100
            ? 'Objectif atteint !'
            : `Objectif "${goal.name}" - ${milestone}% atteint`;
          const message = milestone === 100
            ? `Felicitations ! Vous avez atteint votre objectif "${goal.name}" de ${targetAmount.toLocaleString('fr-FR')} FCFA.`
            : `Vous avez atteint ${milestone}% de votre objectif "${goal.name}". Montant actuel : ${newAmount.toLocaleString('fr-FR')} FCFA / ${targetAmount.toLocaleString('fr-FR')} FCFA.`;

          this.notificationsService.create({
            targetType: 'CLIENT',
            targetId: goal.clientId,
            title,
            message,
            channel: 'SYSTEM',
          }).catch((e) => console.error('[NOTIFICATION]', e.message));
        }
      }

      // 5. Audit
      if (userId) {
        this.auditService.log({
          userId,
          action: 'UPDATE',
          module: 'SAVINGS_GOALS',
          entityId: goal.id,
          entityType: 'SavingsGoal',
          details: `Contribution de ${dto.amount} FCFA vers objectif "${goal.name}" - ${newPercentage}%`,
        }).catch((e) => console.error('[AUDIT]', e.message));
      }

      return {
        goalId: goal.id,
        contributed: dto.amount,
        currentAmount: newAmount,
        targetAmount,
        percentage: Math.min(100, newPercentage),
        isCompleted,
      };
    });
  }

  // ==================== DEBLOCAGE ====================

  async unlock(id: string, userId?: string) {
    const goal = await this.prisma.savingsGoal.findUnique({
      where: { id },
      include: { savingsAccount: true },
    });
    if (!goal) {
      throw new NotFoundException('Objectif epargne non trouve');
    }
    if (goal.isUnlocked) {
      throw new BadRequestException('Cet objectif est deja debloque');
    }

    let bonusAmount = 0;

    // Si l'objectif est complete et qu'il y a un taux bonus, calculer le bonus
    if (goal.isCompleted && Number(goal.bonusRate) > 0) {
      bonusAmount = Math.round(Number(goal.currentAmount) * Number(goal.bonusRate) / 100);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedGoal = await tx.savingsGoal.update({
        where: { id },
        data: {
          isUnlocked: true,
          unlockedAt: new Date(),
        },
        include: { client: true, savingsAccount: true },
      });

      // Si bonus, crediter le compte epargne
      if (bonusAmount > 0) {
        const newBalance = Number(goal.savingsAccount.balance) + bonusAmount;

        await tx.savingsAccount.update({
          where: { id: goal.savingsAccountId },
          data: {
            balance: newBalance,
            interestEarned: { increment: bonusAmount },
          },
        });

        await tx.savingsContribution.create({
          data: {
            savingsAccountId: goal.savingsAccountId,
            type: 'INTEREST',
            amount: bonusAmount,
            balanceAfter: newBalance,
            description: `Bonus objectif atteint: ${goal.name} (${Number(goal.bonusRate)}%)`,
          },
        });
      }

      return updatedGoal;
    });

    // Audit
    if (userId) {
      this.auditService.log({
        userId,
        action: 'UPDATE',
        module: 'SAVINGS_GOALS',
        entityId: goal.id,
        entityType: 'SavingsGoal',
        details: `Deblocage objectif "${goal.name}"${bonusAmount > 0 ? ` - Bonus ${bonusAmount} FCFA` : ''}`,
      }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return { ...updated, bonusAmount };
  }

  // ==================== PROGRESSION ====================

  async getProgress(id: string) {
    const goal = await this.prisma.savingsGoal.findUnique({
      where: { id },
    });
    if (!goal) {
      throw new NotFoundException('Objectif epargne non trouve');
    }

    const targetAmount = Number(goal.targetAmount);
    const currentAmount = Number(goal.currentAmount);
    const remainingAmount = Math.max(0, targetAmount - currentAmount);
    const percentage = targetAmount > 0
      ? Math.min(100, Math.round((currentAmount / targetAmount) * 100))
      : 0;

    // Calculer les jours restants
    const now = new Date();
    const targetDate = new Date(goal.targetDate);
    const remainingDays = Math.max(0, Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Calculer si on est "on track" (projection lineaire)
    const createdAt = new Date(goal.createdAt);
    const totalDays = Math.ceil((targetDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    let onTrack = true;
    if (totalDays > 0 && elapsedDays > 0 && !goal.isCompleted) {
      const expectedPercentage = (elapsedDays / totalDays) * 100;
      onTrack = percentage >= expectedPercentage * 0.9; // tolerance de 10%
    }

    return {
      targetAmount,
      currentAmount,
      percentage,
      remainingAmount,
      remainingDays,
      onTrack,
      isCompleted: goal.isCompleted,
      isUnlocked: goal.isUnlocked,
    };
  }
}
