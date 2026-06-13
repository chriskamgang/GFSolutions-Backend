import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AmlService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private generateReference(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `AML-${ts}-${rand}`;
  }

  // Seuils COBAC/CEMAC
  private readonly DECLARATION_THRESHOLD = 5_000_000; // 5M FCFA
  private readonly FRACTIONNEMENT_PERIOD_DAYS = 7;
  private readonly FRACTIONNEMENT_THRESHOLD = 5_000_000;

  /**
   * Analyse automatique d'une transaction pour detecter les operations suspectes
   */
  async analyzeTransaction(transactionId: string, amount: number, clientId: string, type: string) {
    const alerts: any[] = [];

    // 1. Seuil de declaration (>= 5M FCFA)
    if (amount >= this.DECLARATION_THRESHOLD) {
      alerts.push({
        alertType: 'SEUIL_DECLARATION',
        riskLevel: 'HIGH',
        title: `Transaction >= ${this.DECLARATION_THRESHOLD.toLocaleString()} FCFA`,
        description: `Transaction ${type} de ${amount.toLocaleString()} FCFA depasse le seuil de declaration obligatoire COBAC.`,
      });
    }

    // 2. Fractionnement (plusieurs operations cumulant > seuil en 7 jours)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - this.FRACTIONNEMENT_PERIOD_DAYS);

    const recentTransactions = await this.prisma.transaction.findMany({
      where: {
        OR: [
          { fromAccount: { clientId } },
          { toAccount: { clientId } },
        ],
        createdAt: { gte: weekAgo },
        status: 'COMPLETED',
      },
      select: { amount: true },
    });

    const totalRecent = recentTransactions.reduce((sum, t) => sum + Number(t.amount), 0) + amount;
    if (totalRecent >= this.FRACTIONNEMENT_THRESHOLD && amount < this.DECLARATION_THRESHOLD) {
      alerts.push({
        alertType: 'FRACTIONNEMENT',
        riskLevel: 'HIGH',
        title: 'Suspicion de fractionnement',
        description: `Cumul de ${totalRecent.toLocaleString()} FCFA sur ${this.FRACTIONNEMENT_PERIOD_DAYS} jours (${recentTransactions.length + 1} operations). Possible fractionnement pour eviter le seuil de declaration.`,
      });
    }

    // 3. Client PEP
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { isPEP: true, firstName: true, lastName: true, raisonSociale: true },
    });

    if (client?.isPEP && amount >= 1_000_000) {
      alerts.push({
        alertType: 'PEP',
        riskLevel: 'MEDIUM',
        title: 'Transaction PEP significative',
        description: `Client PEP (${client.firstName || ''} ${client.lastName || client.raisonSociale || ''}) - Transaction de ${amount.toLocaleString()} FCFA.`,
      });
    }

    // 4. Cash suspect (gros depot/retrait especes)
    if ((type === 'DEPOSIT' || type === 'WITHDRAWAL') && amount >= 2_000_000) {
      alerts.push({
        alertType: 'CASH_SUSPECT',
        riskLevel: 'MEDIUM',
        title: `${type === 'DEPOSIT' ? 'Depot' : 'Retrait'} especes important`,
        description: `${type === 'DEPOSIT' ? 'Depot' : 'Retrait'} de ${amount.toLocaleString()} FCFA en especes.`,
      });
    }

    // Creer les alertes
    for (const alert of alerts) {
      await this.prisma.amlAlert.create({
        data: {
          reference: this.generateReference(),
          clientId,
          transactionId,
          ...alert,
          amount,
        },
      });
    }

    return alerts.length;
  }

  /**
   * Lister les alertes LAB/FT avec filtres
   */
  async findAll(filters: {
    status?: string;
    riskLevel?: string;
    alertType?: string;
    clientId?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, riskLevel, alertType, clientId, page = 1, limit = 20 } = filters;

    const where: any = {};
    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (alertType) where.alertType = alertType;
    if (clientId) where.clientId = clientId;

    const [data, total] = await Promise.all([
      this.prisma.amlAlert.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, raisonSociale: true, clientNumber: true, phone: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.amlAlert.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Detail d'une alerte
   */
  async findOne(id: string) {
    const alert = await this.prisma.amlAlert.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, raisonSociale: true, clientNumber: true, phone: true, isPEP: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!alert) throw new NotFoundException('Alerte non trouvee');
    return alert;
  }

  /**
   * Mettre a jour le statut d'une alerte (investigation, cloture, etc.)
   */
  async updateStatus(id: string, dto: { status: string; investigationNotes?: string; resolution?: string; assignedToId?: string }, userId: string) {
    const alert = await this.prisma.amlAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alerte non trouvee');

    const data: any = { status: dto.status };
    if (dto.investigationNotes) data.investigationNotes = dto.investigationNotes;
    if (dto.resolution) data.resolution = dto.resolution;
    if (dto.assignedToId) data.assignedToId = dto.assignedToId;

    const updated = await this.prisma.amlAlert.update({ where: { id }, data });

    this.auditService.log({
      userId, action: 'UPDATE', module: 'AML',
      entityId: id, entityType: 'AmlAlert',
      details: `Alerte ${alert.reference} -> ${dto.status}`,
    }).catch(() => {});

    return updated;
  }

  /**
   * Declarer a l'autorite (ANIF)
   */
  async reportToAuthority(id: string, userId: string) {
    const alert = await this.prisma.amlAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alerte non trouvee');
    if (alert.reportedToAuthority) throw new BadRequestException('Deja declaree');

    const updated = await this.prisma.amlAlert.update({
      where: { id },
      data: {
        reportedToAuthority: true,
        reportDate: new Date(),
        status: 'REPORTED',
      },
    });

    this.auditService.log({
      userId, action: 'UPDATE', module: 'AML',
      entityId: id, entityType: 'AmlAlert',
      details: `Alerte ${alert.reference} declaree a l'ANIF`,
    }).catch(() => {});

    return updated;
  }

  /**
   * Statistiques LAB/FT
   */
  async getStats() {
    const [total, open, investigating, escalated, reported, byRisk, byType] = await Promise.all([
      this.prisma.amlAlert.count(),
      this.prisma.amlAlert.count({ where: { status: 'OPEN' } }),
      this.prisma.amlAlert.count({ where: { status: 'INVESTIGATING' } }),
      this.prisma.amlAlert.count({ where: { status: 'ESCALATED' } }),
      this.prisma.amlAlert.count({ where: { reportedToAuthority: true } }),
      this.prisma.amlAlert.groupBy({ by: ['riskLevel'], _count: true }),
      this.prisma.amlAlert.groupBy({ by: ['alertType'], _count: true }),
    ]);

    return {
      total,
      open,
      investigating,
      escalated,
      reported,
      byRisk: byRisk.reduce((acc, r) => ({ ...acc, [r.riskLevel]: r._count }), {}),
      byType: byType.reduce((acc, t) => ({ ...acc, [t.alertType]: t._count }), {}),
    };
  }
}
