import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TreasuryService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Position de tresorerie consolidee
   * Vue globale : caisse, banques, coffres, epargne, credits
   */
  async getConsolidatedPosition(agencyId?: string) {
    const agencyFilter = agencyId ? { agencyId } : {};

    // Total des soldes comptes courants clients (passif = argent qu'on doit aux clients)
    const depositsClientsAgg = await this.prisma.account.aggregate({
      _sum: { balance: true },
      where: { ...agencyFilter, type: 'CURRENT', status: 'ACTIVE' },
    });

    // Total epargne clients
    const savingsClientsAgg = await this.prisma.account.aggregate({
      _sum: { balance: true },
      where: { ...agencyFilter, type: 'SAVINGS', status: 'ACTIVE' },
    });

    // Total DAT
    const datClientsAgg = await this.prisma.account.aggregate({
      _sum: { balance: true },
      where: { ...agencyFilter, type: 'DAT', status: 'ACTIVE' },
    });

    // Credits en cours (actif = argent qu'on nous doit)
    const creditsAgg = await this.prisma.credit.aggregate({
      _sum: { remainingAmount: true },
      where: { status: { in: ['DISBURSED', 'ACTIVE'] } },
    });

    // Caisse - solde des caisses ouvertes (solde = ouverture + depots - retraits)
    const cashRegisters = await this.prisma.cashRegister.findMany({
      where: { ...agencyFilter, status: 'OPEN' },
      select: { id: true, openingBalance: true, totalDeposits: true, totalWithdrawals: true, agencyId: true, userId: true },
    });
    const totalCash = cashRegisters.reduce((sum, cr) => sum + Number(cr.openingBalance) + Number(cr.totalDeposits) - Number(cr.totalWithdrawals), 0);

    // Transactions du jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [depositsToday, withdrawalsToday, txCountToday] = await Promise.all([
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...agencyFilter, type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: today } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...agencyFilter, type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: today } },
      }),
      this.prisma.transaction.count({
        where: { ...agencyFilter, status: 'COMPLETED', createdAt: { gte: today } },
      }),
    ]);

    // Transactions du mois
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [depositsMonth, withdrawalsMonth, feesMonth] = await Promise.all([
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...agencyFilter, type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: startOfMonth } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...agencyFilter, type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: startOfMonth } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { fees: true },
        where: { ...agencyFilter, status: 'COMPLETED', createdAt: { gte: startOfMonth } },
      }),
    ]);

    const depositsClients = Number(depositsClientsAgg._sum.balance || 0);
    const savingsClients = Number(savingsClientsAgg._sum.balance || 0);
    const datClients = Number(datClientsAgg._sum.balance || 0);
    const creditsEncours = Number(creditsAgg._sum.remainingAmount || 0);

    return {
      // Position consolidee
      caissePrincipale: totalCash,
      depotClients: depositsClients,
      epargneClients: savingsClients,
      datClients,
      totalDepots: depositsClients + savingsClients + datClients,
      creditsEncours,
      // Solde net = credits (actif) - depots clients (passif)
      soldeNet: creditsEncours - (depositsClients + savingsClients + datClients) + totalCash,

      // Caisses detaillees
      caisses: cashRegisters,

      // Activite du jour
      today: {
        depots: Number(depositsToday._sum.amount || 0),
        retraits: Number(withdrawalsToday._sum.amount || 0),
        soldeJour: Number(depositsToday._sum.amount || 0) - Number(withdrawalsToday._sum.amount || 0),
        nbTransactions: txCountToday,
      },

      // Activite du mois
      month: {
        depots: Number(depositsMonth._sum.amount || 0),
        retraits: Number(withdrawalsMonth._sum.amount || 0),
        fraisPercus: Number(feesMonth._sum.fees || 0),
        soldeNet: Number(depositsMonth._sum.amount || 0) - Number(withdrawalsMonth._sum.amount || 0),
      },
    };
  }

  /**
   * Position par agence
   */
  async getPositionByAgency() {
    const agencies = await this.prisma.agency.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, city: true },
    });

    const positions: any[] = [];
    for (const agency of agencies) {
      const depositsAgg = await this.prisma.account.aggregate({
        _sum: { balance: true },
        where: { agencyId: agency.id, status: 'ACTIVE' },
      });
      const cashRegs = await this.prisma.cashRegister.findMany({
        where: { agencyId: agency.id, status: 'OPEN' },
        select: { openingBalance: true, totalDeposits: true, totalWithdrawals: true },
      });
      const clientCount = await this.prisma.client.count({ where: { agencyId: agency.id } });

      positions.push({
        agencyId: agency.id,
        name: agency.name,
        code: agency.code,
        city: agency.city,
        totalDepots: Number(depositsAgg._sum.balance || 0),
        soldeCaisse: cashRegs.reduce((sum, cr) => sum + Number(cr.openingBalance) + Number(cr.totalDeposits) - Number(cr.totalWithdrawals), 0),
        nbClients: clientCount,
      });
    }

    return positions;
  }

  /**
   * Evolution des depots/retraits sur les 30 derniers jours
   */
  async getTrend() {
    const days: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const [dep, ret] = await Promise.all([
        this.prisma.transaction.aggregate({
          _sum: { amount: true },
          where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: date, lt: nextDay } },
        }),
        this.prisma.transaction.aggregate({
          _sum: { amount: true },
          where: { type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: date, lt: nextDay } },
        }),
      ]);

      days.push({
        date: date.toISOString().slice(0, 10),
        depots: Number(dep._sum.amount || 0),
        retraits: Number(ret._sum.amount || 0),
      });
    }

    return days;
  }

  // ==================== COFFRE-FORT ====================

  async createVault(agencyId: string, initialBalance: number = 0) {
    const existing = await this.prisma.vault.findUnique({ where: { agencyId } });
    if (existing) {
      throw new BadRequestException('Un coffre-fort existe deja pour cette agence');
    }

    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('Agence non trouvee');

    return this.prisma.vault.create({
      data: { agencyId, balance: initialBalance },
      include: { agency: true },
    });
  }

  async getVaults() {
    return this.prisma.vault.findMany({
      include: {
        agency: { select: { id: true, name: true, code: true, city: true } },
        _count: { select: { movements: true } },
      },
      orderBy: { agency: { name: 'asc' } },
    });
  }

  async getVaultByAgency(agencyId: string) {
    const vault = await this.prisma.vault.findUnique({
      where: { agencyId },
      include: {
        agency: { select: { id: true, name: true, code: true } },
        movements: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            requestedBy: { select: { id: true, firstName: true, lastName: true } },
            approvedBy: { select: { id: true, firstName: true, lastName: true } },
            cashRegister: { select: { id: true, userId: true } },
          },
        },
      },
    });
    if (!vault) throw new NotFoundException('Coffre-fort non trouve pour cette agence');
    return vault;
  }

  /**
   * Delestage : caisse -> coffre
   */
  async requestDepositToVault(vaultId: string, cashRegisterId: string, amount: number, userId: string, notes?: string) {
    const vault = await this.prisma.vault.findUnique({ where: { id: vaultId } });
    if (!vault) throw new NotFoundException('Coffre-fort non trouve');

    const cashRegister = await this.prisma.cashRegister.findUnique({ where: { id: cashRegisterId } });
    if (!cashRegister) throw new NotFoundException('Caisse non trouvee');
    if (cashRegister.status !== 'OPEN') throw new BadRequestException('La caisse doit etre ouverte');

    // Verifier solde suffisant dans la caisse
    const currentBalance = Number(cashRegister.openingBalance) + Number(cashRegister.totalDeposits) - Number(cashRegister.totalWithdrawals);
    if (currentBalance < amount) {
      throw new BadRequestException(`Solde caisse insuffisant (${currentBalance} FCFA) pour un delestage de ${amount} FCFA`);
    }

    const movement = await this.prisma.vaultMovement.create({
      data: {
        vaultId,
        cashRegisterId,
        type: 'DEPOSIT_TO_VAULT',
        amount,
        requestedById: userId,
        notes,
      },
      include: {
        vault: { include: { agency: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });

    // Notifier les chefs d'agence
    const chefs = await this.prisma.user.findMany({
      where: { agencyId: vault.agencyId, role: { name: { in: ['CHEF_AGENCE', 'CAISSIER_PRINCIPAL', 'DIRECTEUR_GENERAL'] } } },
    });
    for (const chef of chefs) {
      this.notificationsService.create({
        targetType: 'USER',
        targetId: chef.id,
        title: 'Delestage en attente',
        message: `Demande de delestage de ${amount} FCFA de la caisse vers le coffre-fort - ${movement.vault.agency.name}`,
      }).catch(e => console.error('[NOTIFICATION]', e.message));
    }

    this.auditService.log({
      userId, action: 'CREATE', module: 'TREASURY',
      entityId: movement.id, entityType: 'VaultMovement',
      details: `Demande delestage ${amount} FCFA caisse -> coffre`,
    }).catch(e => console.error('[AUDIT]', e.message));

    return movement;
  }

  /**
   * Approvisionnement : coffre -> caisse
   */
  async requestWithdrawalFromVault(vaultId: string, cashRegisterId: string, amount: number, userId: string, notes?: string) {
    const vault = await this.prisma.vault.findUnique({ where: { id: vaultId } });
    if (!vault) throw new NotFoundException('Coffre-fort non trouve');
    if (Number(vault.balance) < amount) {
      throw new BadRequestException(`Solde coffre insuffisant (${Number(vault.balance)} FCFA) pour un approvisionnement de ${amount} FCFA`);
    }

    const cashRegister = await this.prisma.cashRegister.findUnique({ where: { id: cashRegisterId } });
    if (!cashRegister) throw new NotFoundException('Caisse non trouvee');
    if (cashRegister.status !== 'OPEN') throw new BadRequestException('La caisse doit etre ouverte');

    const movement = await this.prisma.vaultMovement.create({
      data: {
        vaultId,
        cashRegisterId,
        type: 'WITHDRAWAL_FROM_VAULT',
        amount,
        requestedById: userId,
        notes,
      },
      include: {
        vault: { include: { agency: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });

    // Notifier les chefs d'agence
    const chefs = await this.prisma.user.findMany({
      where: { agencyId: vault.agencyId, role: { name: { in: ['CHEF_AGENCE', 'CAISSIER_PRINCIPAL', 'DIRECTEUR_GENERAL'] } } },
    });
    for (const chef of chefs) {
      this.notificationsService.create({
        targetType: 'USER',
        targetId: chef.id,
        title: 'Approvisionnement en attente',
        message: `Demande d'approvisionnement de ${amount} FCFA du coffre-fort vers la caisse - ${movement.vault.agency.name}`,
      }).catch(e => console.error('[NOTIFICATION]', e.message));
    }

    this.auditService.log({
      userId, action: 'CREATE', module: 'TREASURY',
      entityId: movement.id, entityType: 'VaultMovement',
      details: `Demande approvisionnement ${amount} FCFA coffre -> caisse`,
    }).catch(e => console.error('[AUDIT]', e.message));

    return movement;
  }

  /**
   * Approuver ou rejeter un mouvement coffre
   * Double validation si montant > seuil (5,000,000 FCFA)
   */
  async approveVaultMovement(movementId: string, approved: boolean, userId: string, comment?: string) {
    const movement = await this.prisma.vaultMovement.findUnique({
      where: { id: movementId },
      include: { vault: true, cashRegister: true },
    });
    if (!movement) throw new NotFoundException('Mouvement non trouve');
    if (movement.status !== 'PENDING') throw new BadRequestException('Ce mouvement a deja ete traite');
    if (movement.requestedById === userId) {
      throw new ForbiddenException('Vous ne pouvez pas approuver votre propre demande');
    }

    if (!approved) {
      const rejected = await this.prisma.vaultMovement.update({
        where: { id: movementId },
        data: { status: 'REJECTED', approvedById: userId, approvedAt: new Date(), rejectedReason: comment },
      });

      this.auditService.log({
        userId, action: 'UPDATE', module: 'TREASURY',
        entityId: movementId, entityType: 'VaultMovement',
        details: `Mouvement coffre rejete : ${comment || 'Aucun motif'}`,
      }).catch(e => console.error('[AUDIT]', e.message));

      return rejected;
    }

    // Executer le mouvement dans une transaction atomique
    const result = await this.prisma.$transaction(async (tx) => {
      if (movement.type === 'DEPOSIT_TO_VAULT') {
        // Delestage : caisse -> coffre
        // Verifier que la caisse a toujours le solde
        const cr = await tx.cashRegister.findUnique({ where: { id: movement.cashRegisterId } });
        if (!cr) throw new BadRequestException('Caisse introuvable');
        const crBalance = Number(cr.openingBalance) + Number(cr.totalDeposits) - Number(cr.totalWithdrawals);
        if (crBalance < Number(movement.amount)) {
          throw new BadRequestException(`Solde caisse insuffisant (${crBalance} FCFA)`);
        }

        // Debiter la caisse (incrementer les retraits)
        await tx.cashRegister.update({
          where: { id: movement.cashRegisterId },
          data: { totalWithdrawals: { increment: Number(movement.amount) } },
        });

        // Crediter le coffre
        await tx.vault.update({
          where: { id: movement.vaultId },
          data: { balance: { increment: Number(movement.amount) } },
        });
      } else {
        // Approvisionnement : coffre -> caisse
        const v = await tx.vault.findUnique({ where: { id: movement.vaultId } });
        if (!v) throw new BadRequestException('Coffre introuvable');
        if (Number(v.balance) < Number(movement.amount)) {
          throw new BadRequestException(`Solde coffre insuffisant (${Number(v.balance)} FCFA)`);
        }

        // Debiter le coffre
        await tx.vault.update({
          where: { id: movement.vaultId },
          data: { balance: { decrement: Number(movement.amount) } },
        });

        // Crediter la caisse (incrementer les depots)
        await tx.cashRegister.update({
          where: { id: movement.cashRegisterId },
          data: { totalDeposits: { increment: Number(movement.amount) } },
        });
      }

      // Marquer comme approuve
      return tx.vaultMovement.update({
        where: { id: movementId },
        data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
        include: { vault: true, cashRegister: true, requestedBy: { select: { firstName: true, lastName: true } } },
      });
    });

    this.auditService.log({
      userId, action: 'UPDATE', module: 'TREASURY',
      entityId: movementId, entityType: 'VaultMovement',
      details: `Mouvement coffre approuve : ${movement.type} de ${Number(movement.amount)} FCFA`,
    }).catch(e => console.error('[AUDIT]', e.message));

    return result;
  }

  async getVaultMovements(params: { vaultId?: string; agencyId?: string; status?: string; page?: number; limit?: number }) {
    const { vaultId, agencyId, status, page = 1, limit = 20 } = params;
    const where: any = {};
    if (vaultId) where.vaultId = vaultId;
    if (agencyId) where.vault = { agencyId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.vaultMovement.findMany({
        where,
        include: {
          vault: { include: { agency: { select: { name: true, code: true } } } },
          cashRegister: { select: { id: true, userId: true } },
          requestedBy: { select: { id: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vaultMovement.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPendingMovements(agencyId?: string) {
    const where: any = { status: 'PENDING' };
    if (agencyId) where.vault = { agencyId };

    return this.prisma.vaultMovement.findMany({
      where,
      include: {
        vault: { include: { agency: { select: { name: true, code: true } } } },
        cashRegister: { select: { id: true, userId: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ==================== PLAFOND DE CAISSE ====================

  async setCashCeiling(cashRegisterId: string, ceiling: number | null, userId: string) {
    const cr = await this.prisma.cashRegister.findUnique({ where: { id: cashRegisterId } });
    if (!cr) throw new NotFoundException('Caisse non trouvee');

    const updated = await this.prisma.cashRegister.update({
      where: { id: cashRegisterId },
      data: { cashCeiling: ceiling },
    });

    this.auditService.log({
      userId, action: 'UPDATE', module: 'TREASURY',
      entityId: cashRegisterId, entityType: 'CashRegister',
      details: `Plafond de caisse modifie : ${ceiling ? ceiling + ' FCFA' : 'Supprime'}`,
    }).catch(e => console.error('[AUDIT]', e.message));

    return updated;
  }

  async getCashCeilingStatus(userId: string) {
    const cr = await this.prisma.cashRegister.findFirst({
      where: { userId, status: 'OPEN' },
    });
    if (!cr) return { hasOpenRegister: false };

    const currentBalance = Number(cr.openingBalance) + Number(cr.totalDeposits) - Number(cr.totalWithdrawals);
    const ceiling = cr.cashCeiling ? Number(cr.cashCeiling) : null;

    return {
      hasOpenRegister: true,
      cashRegisterId: cr.id,
      currentBalance,
      ceiling,
      usagePercent: ceiling ? Math.round((currentBalance / ceiling) * 100) : null,
      alert: ceiling && currentBalance > ceiling * 0.8 ? (currentBalance >= ceiling ? 'BLOCKED' : 'WARNING') : null,
      excessAmount: ceiling && currentBalance > ceiling ? currentBalance - ceiling : 0,
    };
  }
}
