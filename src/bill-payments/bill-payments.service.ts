import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ElgioPayService } from './elgiopay.service';

export const OPERATORS: Record<string, string> = {
  ENEO: 'ENEO – Électricité',
  CAMWATER: 'CamWater – Eau',
  CANAL_PLUS: 'Canal+',
  CAMTEL: 'Camtel – Téléphone/Internet',
  DGI: 'DGI – Impôts',
  SCHOOL: 'Frais scolaires',
  ELGIOPAY_RECHARGE: 'Recharge ElgioPay',
  OTHER: 'Autre',
};

@Injectable()
export class BillPaymentsService {
  private readonly logger = new Logger(BillPaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private elgioPay: ElgioPayService,
  ) {}

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

  // ========== ELGIOPAY INTEGRATION ==========

  /**
   * Check if ElgioPay API is configured
   */
  isElgioPayConfigured(): boolean {
    return this.elgioPay.isConfigured();
  }

  /**
   * Get available bill services from ElgioPay (ENEO, CamWater, Canal+, etc.)
   */
  async getElgioPayServices(category?: string) {
    return this.elgioPay.listServices(category);
  }

  /**
   * Look up a bill on ElgioPay
   */
  async lookupBill(serviceCode: string, subscriberNumber: string) {
    return this.elgioPay.getBill(serviceCode, subscriberNumber);
  }

  /**
   * Full bill payment flow via ElgioPay:
   * 1. Pay bill via API → 2. Debit GFS account if needed → 3. Record in DB
   */
  async payBillViaElgioPay(userId: string, dto: {
    serviceCode: string;
    subscriberNumber: string;
    amount: number;
    operator: string;
    payerName: string;
    payerPhone?: string;
    paymentMode: 'CASH' | 'ACCOUNT';
    accountId?: string;
    agencyId: string;
    fees?: number;
    notes?: string;
  }) {
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('Montant invalide');

    // Step 1: Check GFS account balance if payment mode is ACCOUNT
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
    }

    // Step 2: Pay bill via ElgioPay API
    this.logger.log(`ElgioPay payment: service=${dto.serviceCode}, amount=${dto.amount}, subscriber=${dto.subscriberNumber}`);
    const payResult = await this.elgioPay.payBill(
      dto.serviceCode,
      dto.subscriberNumber,
      dto.amount,
      dto.payerPhone,
    );

    // Step 3: Debit GFS account now that payment is confirmed
    if (dto.paymentMode === 'ACCOUNT' && dto.accountId) {
      const totalDue = dto.amount + (dto.fees || 0);
      await this.prisma.account.update({
        where: { id: dto.accountId },
        data: { balance: { decrement: totalDue } },
      });
    }

    // Step 4: Record in database
    const reference = 'ELGIO-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    const payment = await this.prisma.billPayment.create({
      data: {
        reference,
        operator: dto.operator,
        billNumber: dto.subscriberNumber,
        payerName: dto.payerName,
        payerPhone: dto.payerPhone,
        amount: dto.amount,
        fees: dto.fees || 0,
        paymentMode: dto.paymentMode,
        accountId: dto.paymentMode === 'ACCOUNT' ? dto.accountId : null,
        agencyId: dto.agencyId,
        collectedById: userId,
        status: 'COLLECTED',
        notes: [
          dto.notes || '',
          `[ElgioPay] Ref: ${payResult.reference}`,
          `Status: ${payResult.status}`,
        ].filter(Boolean).join(' | '),
      },
      include: {
        collectedBy: { select: { firstName: true, lastName: true } },
        agency: { select: { name: true } },
        account: { select: { accountNumber: true } },
      },
    });

    return {
      payment,
      elgioPay: {
        reference: payResult.reference,
        status: payResult.status,
        message: payResult.message,
      },
    };
  }

  /**
   * Get ElgioPay account balance
   */
  async getElgioPayBalance() {
    return this.elgioPay.getBalance();
  }

  /**
   * Recharge ElgioPay account via Mobile Money
   * Sends a payment prompt to the customer's phone
   */
  async rechargeElgioPay(userId: string, dto: {
    amount: number;
    customerPhone: string;
    paymentMethod: 'mtn_mobile_money' | 'orange_money';
    customerName?: string;
  }) {
    if (!dto.amount || dto.amount < 100) throw new BadRequestException('Montant minimum: 100 FCFA');
    if (!dto.customerPhone) throw new BadRequestException('Numero de telephone requis');

    this.logger.log(`ElgioPay recharge: ${dto.amount} FCFA via ${dto.paymentMethod} from ${dto.customerPhone}`);

    const gfsRef = `RECH-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const result = await this.elgioPay.initiatePayment({
      amount: dto.amount,
      customerPhone: dto.customerPhone,
      paymentMethod: dto.paymentMethod,
      customerName: dto.customerName,
      reference: gfsRef,
      metadata: { initiatedBy: userId, type: 'ACCOUNT_RECHARGE' },
    });

    // Recuperer l'agence du user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { agencyId: true, firstName: true, lastName: true },
    });

    // Enregistrer la recharge dans la BD pour tracabilite
    await this.prisma.billPayment.create({
      data: {
        reference: gfsRef,
        operator: 'ELGIOPAY_RECHARGE',
        billNumber: dto.customerPhone,
        payerName: dto.customerName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        payerPhone: dto.customerPhone,
        amount: dto.amount,
        fees: 0,
        paymentMode: dto.paymentMethod === 'mtn_mobile_money' ? 'MTN_MOMO' : 'ORANGE_MONEY',
        agencyId: user?.agencyId || '',
        collectedById: userId,
        status: 'PENDING',
        notes: `[ElgioPay Recharge] TxnID: ${result.transaction_id || ''} | Method: ${dto.paymentMethod} | Status: ${result.status || 'pending'}`,
      },
    });

    return {
      success: true,
      transactionId: result.transaction_id,
      reference: gfsRef,
      status: result.status,
      message: result.message || 'Demande de paiement envoyee. Validez sur votre telephone.',
    };
  }

  /**
   * Get recharge status and update in DB
   */
  async getRechargeStatus(transactionId: string) {
    const result = await this.elgioPay.getPaymentStatus(transactionId);

    // Mettre a jour le statut en BD
    if (result?.status) {
      const dbStatus = (result.status === 'completed' || result.status === 'successful') ? 'COLLECTED'
        : (result.status === 'failed' || result.status === 'cancelled') ? 'CANCELLED'
        : 'PENDING';

      // Chercher par le transactionId dans les notes
      const record = await this.prisma.billPayment.findFirst({
        where: {
          operator: 'ELGIOPAY_RECHARGE',
          notes: { contains: transactionId },
        },
      });
      if (record) {
        await this.prisma.billPayment.update({
          where: { id: record.id },
          data: {
            status: dbStatus,
            notes: `[ElgioPay Recharge] TxnID: ${transactionId} | Status: ${result.status}${result.completed_at ? ' | Completed: ' + result.completed_at : ''}`,
          },
        });
      }
    }

    return result;
  }

  /**
   * Force verify a recharge and update in DB
   */
  async verifyRecharge(transactionId: string) {
    const result = await this.elgioPay.verifyPayment(transactionId);

    if (result?.status) {
      const dbStatus = (result.status === 'completed' || result.status === 'successful') ? 'COLLECTED'
        : (result.status === 'failed' || result.status === 'cancelled') ? 'CANCELLED'
        : 'PENDING';

      const record = await this.prisma.billPayment.findFirst({
        where: {
          operator: 'ELGIOPAY_RECHARGE',
          notes: { contains: transactionId },
        },
      });
      if (record) {
        await this.prisma.billPayment.update({
          where: { id: record.id },
          data: { status: dbStatus },
        });
      }
    }

    return result;
  }

  /**
   * Purger les donnees de test sandbox
   */
  async purgeSandboxData(userId: string) {
    const result = await this.prisma.billPayment.deleteMany({
      where: {
        OR: [
          { reference: { startsWith: 'ELGIO-' } },
          { reference: { startsWith: 'RECH-' } },
          { operator: 'ELGIOPAY_RECHARGE', status: { in: ['PENDING', 'COLLECTED'] }, notes: { contains: 'sandbox' } },
        ],
      },
    });

    this.logger.log(`Sandbox data purged by user ${userId}: ${result.count} records deleted`);
    return { success: true, count: result.count, message: `${result.count} enregistrement(s) de test supprime(s)` };
  }

  /**
   * Historique des recharges ElgioPay
   */
  async getRechargeHistory(query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = { operator: 'ELGIOPAY_RECHARGE' };

    const [data, total] = await Promise.all([
      this.prisma.billPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          collectedBy: { select: { firstName: true, lastName: true } },
          agency: { select: { name: true } },
        },
      }),
      this.prisma.billPayment.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * KPIs globaux
   */
  async getKpis(agencyId?: string) {
    const where: any = { status: { notIn: ['PENDING', 'CANCELLED'] } };
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
