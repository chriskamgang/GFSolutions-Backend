import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { AccountingService } from '../accounting/accounting.service';
import { v4 as uuidv4 } from 'uuid';

export type PawaPayProvider = 'MTN_MOMO' | 'ORANGE_MONEY';

// Mapping providers GFS -> codes pawaPay Cameroun
const PROVIDER_MAP: Record<PawaPayProvider, string> = {
  MTN_MOMO: 'MTN_MOMO_CMR',
  ORANGE_MONEY: 'ORANGE_CMR',
};

@Injectable()
export class PawaPayService {
  private readonly logger = new Logger(PawaPayService.name);
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly callbackUrl: string;
  private readonly currency = 'XAF';

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private smsService: SmsService,
    private accountingService: AccountingService,
  ) {
    this.baseUrl = this.configService.get<string>('PAWAPAY_BASE_URL', 'https://api.sandbox.pawapay.io');
    this.apiToken = this.configService.get<string>('PAWAPAY_API_TOKEN', '');
    this.callbackUrl = this.configService.get<string>('PAWAPAY_CALLBACK_URL', '');
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private formatPhone(phone: string): string {
    // pawaPay attend le format international sans + ex: 237699123456
    return phone.replace(/^\+/, '').replace(/\s/g, '');
  }

  private generateReference(): string {
    return `TXN-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  }

  // ==================== DEPOSIT (client envoie de l'argent) ====================

  async initiateDeposit(params: {
    accountId: string;
    amount: number;
    phone: string;
    provider: PawaPayProvider;
    agencyId: string;
    description?: string;
    initiatedBy?: string; // userId staff ou clientId
  }) {
    if (!this.apiToken) throw new BadRequestException('pawaPay non configure (PAWAPAY_API_TOKEN manquant)');

    const account = await this.prisma.account.findUnique({
      where: { id: params.accountId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException('Compte non trouve');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Compte inactif');

    const depositId = uuidv4();
    const reference = this.generateReference();

    // Creer la transaction en PENDING
    const transaction = await this.prisma.transaction.create({
      data: {
        reference,
        type: 'DEPOSIT',
        amount: params.amount,
        fees: 0,
        tax: 0,
        toAccountId: params.accountId,
        mobileMoneyProvider: params.provider as any,
        mobileMoneyPhone: params.phone,
        mobileMoneyRef: depositId,
        agencyId: params.agencyId,
        status: 'PENDING',
        description: params.description || `Depot Mobile Money ${params.provider}`,
      },
    });

    // Appel API pawaPay
    try {
      const body = {
        depositId,
        amount: String(Math.round(params.amount)),
        currency: this.currency,
        correspondent: PROVIDER_MAP[params.provider],
        payer: {
          type: 'MSISDN',
          address: { value: this.formatPhone(params.phone) },
        },
        statementDescription: (params.description || 'Depot GFS').slice(0, 22),
        callbackUrl: `${this.callbackUrl}/pawapay/callback/deposit`,
      };

      this.logger.log(`[PawaPay] Depot initie: ${depositId} — ${params.amount} XAF — ${params.provider}`);

      const res = await fetch(`${this.baseUrl}/v2/deposits`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      this.logger.log(`[PawaPay] Reponse depot: ${JSON.stringify(data)}`);

      if (!res.ok || data.status === 'REJECTED') {
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED', description: `Rejete: ${data.rejectionReason?.rejectionCode || 'ERREUR'}` },
        });
        throw new BadRequestException(`Depot rejete: ${data.rejectionReason?.rejectionCode || 'Erreur pawaPay'}`);
      }

      return {
        success: true,
        depositId,
        transactionId: transaction.id,
        reference,
        message: 'Demande de depot envoyee. Le client doit confirmer sur son telephone.',
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`[PawaPay] Erreur depot: ${err.message}`);
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('Erreur communication pawaPay: ' + err.message);
    }
  }

  // ==================== PAYOUT (on envoie de l'argent au client) ====================

  async initiatePayout(params: {
    accountId: string;
    amount: number;
    phone: string;
    provider: PawaPayProvider;
    agencyId: string;
    description?: string;
  }) {
    if (!this.apiToken) throw new BadRequestException('pawaPay non configure (PAWAPAY_API_TOKEN manquant)');

    const account = await this.prisma.account.findUnique({
      where: { id: params.accountId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException('Compte non trouve');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Compte inactif');
    if (Number(account.balance) < params.amount) throw new BadRequestException('Solde insuffisant');

    const payoutId = uuidv4();
    const reference = this.generateReference();

    // Debiter le compte immediatement (PENDING = fonds reserves)
    await this.prisma.account.update({
      where: { id: params.accountId },
      data: { balance: { decrement: params.amount } },
    });

    const transaction = await this.prisma.transaction.create({
      data: {
        reference,
        type: 'WITHDRAWAL',
        amount: params.amount,
        fees: 0,
        tax: 0,
        fromAccountId: params.accountId,
        mobileMoneyProvider: params.provider as any,
        mobileMoneyPhone: params.phone,
        mobileMoneyRef: payoutId,
        agencyId: params.agencyId,
        status: 'PENDING',
        description: params.description || `Retrait Mobile Money ${params.provider}`,
      },
    });

    try {
      const body = {
        payoutId,
        amount: String(Math.round(params.amount)),
        currency: this.currency,
        correspondent: PROVIDER_MAP[params.provider],
        recipient: {
          type: 'MSISDN',
          address: { value: this.formatPhone(params.phone) },
        },
        statementDescription: (params.description || 'Retrait GFS').slice(0, 22),
        callbackUrl: `${this.callbackUrl}/pawapay/callback/payout`,
      };

      this.logger.log(`[PawaPay] Payout initie: ${payoutId} — ${params.amount} XAF — ${params.provider}`);

      const res = await fetch(`${this.baseUrl}/v2/payouts`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      this.logger.log(`[PawaPay] Reponse payout: ${JSON.stringify(data)}`);

      if (!res.ok || data.status === 'REJECTED') {
        // Reverser le debit
        await this.prisma.account.update({
          where: { id: params.accountId },
          data: { balance: { increment: params.amount } },
        });
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED', description: `Rejete: ${data.rejectionReason?.rejectionCode || 'ERREUR'}` },
        });
        throw new BadRequestException(`Payout rejete: ${data.rejectionReason?.rejectionCode || 'Erreur pawaPay'}`);
      }

      return {
        success: true,
        payoutId,
        transactionId: transaction.id,
        reference,
        message: 'Virement Mobile Money initie. Traitement en cours.',
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // Reverser le debit en cas d'erreur reseau
      await this.prisma.account.update({
        where: { id: params.accountId },
        data: { balance: { increment: params.amount } },
      });
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('Erreur communication pawaPay: ' + err.message);
    }
  }

  // ==================== CALLBACKS ====================

  async handleDepositCallback(payload: any) {
    this.logger.log(`[PawaPay] Callback depot: ${JSON.stringify(payload)}`);

    const { depositId, status, amount } = payload;
    if (!depositId) return { received: true };

    const transaction = await this.prisma.transaction.findFirst({
      where: { mobileMoneyRef: depositId },
      include: { toAccount: { include: { client: true } } },
    });

    if (!transaction) {
      this.logger.warn(`[PawaPay] Transaction non trouvee pour depositId: ${depositId}`);
      return { received: true };
    }

    if (transaction.status !== 'PENDING') return { received: true }; // Deja traite

    if (status === 'COMPLETED') {
      // Crediter le compte
      await this.prisma.account.update({
        where: { id: transaction.toAccountId! },
        data: { balance: { increment: Number(amount || transaction.amount) } },
      });

      const updatedTx = await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
      });

      // Ecriture comptable
      try {
        await this.accountingService.recordDeposit(
          transaction.agencyId,
          Number(transaction.amount),
          Number(transaction.fees),
          Number(transaction.tax),
          transaction.reference,
          true, // mobile money
        );
      } catch (e) {
        this.logger.warn(`[COMPTA] Echec ecriture depot MM ${transaction.reference}: ${e.message}`);
      }

      // SMS confirmation
      if (transaction.toAccount?.client?.phone) {
        const balance = await this.prisma.account.findUnique({ where: { id: transaction.toAccountId! }, select: { balance: true, accountNumber: true } });
        this.smsService.sendDepositAlert(
          transaction.toAccount.client.phone,
          balance?.accountNumber || '',
          Number(transaction.amount),
          Number(balance?.balance || 0),
        ).catch(() => {});
      }

      this.logger.log(`[PawaPay] Depot COMPLETE: ${transaction.reference} — ${transaction.amount} XAF`);
      return { received: true, status: 'COMPLETED', reference: transaction.reference };
    }

    if (status === 'FAILED') {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', description: `Echec: ${payload.failureReason?.failureCode || 'INCONNU'}` },
      });
      this.logger.warn(`[PawaPay] Depot ECHEC: ${transaction.reference}`);
    }

    return { received: true };
  }

  async handlePayoutCallback(payload: any) {
    this.logger.log(`[PawaPay] Callback payout: ${JSON.stringify(payload)}`);

    const { payoutId, status, amount } = payload;
    if (!payoutId) return { received: true };

    const transaction = await this.prisma.transaction.findFirst({
      where: { mobileMoneyRef: payoutId },
      include: { fromAccount: { include: { client: true } } },
    });

    if (!transaction || transaction.status !== 'PENDING') return { received: true };

    if (status === 'COMPLETED') {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
      });

      // Ecriture comptable
      try {
        await this.accountingService.recordWithdrawal(
          transaction.agencyId,
          Number(transaction.amount),
          Number(transaction.fees),
          Number(transaction.tax),
          transaction.reference,
          true,
        );
      } catch (e) {
        this.logger.warn(`[COMPTA] Echec ecriture retrait MM ${transaction.reference}: ${e.message}`);
      }

      // SMS confirmation
      if (transaction.fromAccount?.client?.phone) {
        const account = await this.prisma.account.findUnique({ where: { id: transaction.fromAccountId! }, select: { balance: true, accountNumber: true } });
        this.smsService.sendWithdrawalAlert(
          transaction.fromAccount.client.phone,
          account?.accountNumber || '',
          Number(transaction.amount),
          Number(account?.balance || 0),
        ).catch(() => {});
      }

      this.logger.log(`[PawaPay] Payout COMPLETE: ${transaction.reference}`);
    }

    if (status === 'FAILED') {
      // Reverser le debit
      await this.prisma.account.update({
        where: { id: transaction.fromAccountId! },
        data: { balance: { increment: Number(amount || transaction.amount) } },
      });
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', description: `Echec: ${payload.failureReason?.failureCode || 'INCONNU'}` },
      });
      this.logger.warn(`[PawaPay] Payout ECHEC + remboursement: ${transaction.reference}`);
    }

    return { received: true };
  }

  // ==================== STATUS ====================

  async getDepositStatus(depositId: string) {
    const res = await fetch(`${this.baseUrl}/v2/deposits/${depositId}`, { headers: this.headers });
    return res.json();
  }

  async getPayoutStatus(payoutId: string) {
    const res = await fetch(`${this.baseUrl}/v2/payouts/${payoutId}`, { headers: this.headers });
    return res.json();
  }

  async getAvailability() {
    if (!this.apiToken) return { configured: false };
    try {
      const res = await fetch(`${this.baseUrl}/availability`, { headers: this.headers });
      const data = await res.json();
      return { configured: true, ...data };
    } catch {
      return { configured: true, error: 'Impossible de joindre pawaPay' };
    }
  }
}
