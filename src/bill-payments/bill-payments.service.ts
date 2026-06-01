import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const OPERATORS = {
  ENEO: 'ENEO – Électricité',
  CAMWATER: 'CamWater – Eau',
  CANAL_PLUS: 'Canal+',
  CAMTEL: 'Camtel – Téléphone/Internet',
  DGI: 'DGI – Impôts',
  SCHOOL: 'Frais scolaires',
  OTHER: 'Autre',
};

@Injectable()
export class BillPaymentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Enregistrer un paiement de facture
   * Le payeur n'a pas besoin d'être client GFS
   */
  async create(userId: string, dto: {
    operator: string;
    billNumber: string;
    payerName: string;
    payerPhone?: string;
    amount: number;
    fees?: number;
    paymentMode: 'CASH' | 'ACCOUNT';
    accountId?: string;
    agencyId: string;
    notes?: string;
  }) {
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('Montant invalide');
    if (!Object.keys(OPERATORS).includes(dto.operator)) throw new BadRequestException('Opérateur inconnu');

    // Si paiement par débit compte GFS
    if (dto.paymentMode === 'ACCOUNT') {
      if (!dto.accountId) throw new BadRequestException('Compte GFS requis pour ce mode de paiement');
      const account = await this.prisma.account.findFirst({
        where: { id: dto.accountId, status: 'ACTIVE' },
      });
      if (!account) throw new NotFoundException('Compte GFS introuvable');
      const totalDue = dto.amount + (dto.fees || 0);
      if (Number(account.balance) < totalDue) {
        throw new BadRequestException(`Solde insuffisant. Disponible : ${Number(account.balance).toLocaleString('fr-FR')} FCFA`);
      }
      // Débiter le compte
      await this.prisma.account.update({
        where: { id: dto.accountId },
        data: { balance: { decrement: totalDue } },
      });
    }

    const reference = 'FAC-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    const payment = await this.prisma.billPayment.create({
      data: {
        reference,
        operator: dto.operator,
        billNumber: dto.billNumber,
        payerName: dto.payerName,
        payerPhone: dto.payerPhone,
        amount: dto.amount,
        fees: dto.fees || 0,
        paymentMode: dto.paymentMode,
        accountId: dto.paymentMode === 'ACCOUNT' ? dto.accountId : null,
        agencyId: dto.agencyId,
        collectedById: userId,
        status: 'COLLECTED',
        notes: dto.notes,
      },
      include: {
        collectedBy: { select: { firstName: true, lastName: true } },
        agency: { select: { name: true } },
        account: { select: { accountNumber: true } },
      },
    });

    return payment;
  }

  /**
   * Liste paginée avec filtres
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    agencyId?: string;
    operator?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.agencyId) where.agencyId = query.agencyId;
    if (query.operator) where.operator = query.operator;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { payerName: { contains: query.search } },
        { billNumber: { contains: query.search } },
        { reference: { contains: query.search } },
        { payerPhone: { contains: query.search } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.billPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          collectedBy: { select: { firstName: true, lastName: true } },
          agency: { select: { name: true, city: true } },
          account: { select: { accountNumber: true } },
        },
      }),
      this.prisma.billPayment.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Détail d'un paiement
   */
  async findOne(id: string) {
    const payment = await this.prisma.billPayment.findUnique({
      where: { id },
      include: {
        collectedBy: { select: { firstName: true, lastName: true, phone: true } },
        agency: true,
        account: { select: { accountNumber: true } },
      },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    return payment;
  }

  /**
   * Stats par opérateur (pour bordereau de reversement)
   * Retourne les montants collectés non encore reversés
   */
  async getReversalStats(agencyId?: string, dateFrom?: string, dateTo?: string) {
    const where: any = { status: 'COLLECTED' };
    if (agencyId) where.agencyId = agencyId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const payments = await this.prisma.billPayment.findMany({
      where,
      select: { operator: true, amount: true, fees: true, id: true },
    });

    const stats: Record<string, { operator: string; label: string; count: number; totalAmount: number; totalFees: number; toReverse: number }> = {};

    for (const p of payments) {
      if (!stats[p.operator]) {
        stats[p.operator] = {
          operator: p.operator,
          label: OPERATORS[p.operator] || p.operator,
          count: 0,
          totalAmount: 0,
          totalFees: 0,
          toReverse: 0,
        };
      }
      stats[p.operator].count++;
      stats[p.operator].totalAmount += Number(p.amount);
      stats[p.operator].totalFees += Number(p.fees);
      // Montant à reverser = total collecté - frais GFS retenus
      stats[p.operator].toReverse += Number(p.amount);
    }

    return Object.values(stats);
  }

  /**
   * Marquer un lot de paiements comme reversés à l'opérateur
   */
  async markReversed(userId: string, operator: string, agencyId?: string) {
    const where: any = { operator, status: 'COLLECTED' };
    if (agencyId) where.agencyId = agencyId;

    const result = await this.prisma.billPayment.updateMany({
      where,
      data: { status: 'REVERSED', reversedAt: new Date(), reversedById: userId },
    });

    return { success: true, count: result.count, message: `${result.count} paiements ${OPERATORS[operator] || operator} marqués comme reversés.` };
  }

  /**
   * Annuler un paiement (avec remboursement si paiement par compte)
   */
  async cancel(id: string, userId: string) {
    const payment = await this.prisma.billPayment.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.status !== 'COLLECTED') throw new BadRequestException('Seuls les paiements en statut COLLECTED peuvent être annulés');

    if (payment.paymentMode === 'ACCOUNT' && payment.accountId) {
      await this.prisma.account.update({
        where: { id: payment.accountId },
        data: { balance: { increment: Number(payment.amount) + Number(payment.fees) } },
      });
    }

    return this.prisma.billPayment.update({
      where: { id },
      data: { status: 'CANCELLED', reversedAt: new Date(), reversedById: userId },
    });
  }

  /**
   * KPIs globaux
   */
  async getKpis(agencyId?: string) {
    const where: any = {};
    if (agencyId) where.agencyId = agencyId;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayWhere = { ...where, createdAt: { gte: today } };

    const [total, todayCount, pending, byOperator] = await Promise.all([
      this.prisma.billPayment.aggregate({ where, _sum: { amount: true }, _count: true }),
      this.prisma.billPayment.count({ where: todayWhere }),
      this.prisma.billPayment.aggregate({ where: { ...where, status: 'COLLECTED' }, _sum: { amount: true }, _count: true }),
      this.prisma.billPayment.groupBy({
        by: ['operator'],
        where,
        _count: true,
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
    ]);

    return {
      totalCount: total._count,
      totalAmount: Number(total._sum.amount || 0),
      todayCount,
      pendingReversal: { count: pending._count, amount: Number(pending._sum.amount || 0) },
      byOperator: byOperator.map(b => ({
        operator: b.operator,
        label: OPERATORS[b.operator] || b.operator,
        count: b._count,
        amount: Number(b._sum.amount || 0),
      })),
    };
  }
}
