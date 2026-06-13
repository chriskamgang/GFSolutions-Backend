import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AccountingService } from '../accounting/accounting.service';
import { v4 as uuidv4 } from 'uuid';

export type KPayProvider = 'MTN_MOMO_CMR' | 'ORANGE_CMR';

// Mapping interne GFS -> codes KPay Cameroun
const PROVIDER_DISPLAY: Record<string, string> = {
  MTN_MOMO_CMR: 'MTN MoMo',
  ORANGE_CMR: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
  ORANGE_MONEY: 'Orange Money',
};

// Mapping ancien format -> KPay
const PROVIDER_MAP: Record<string, string> = {
  MTN_MOMO: 'MTN_MOMO_CMR',
  ORANGE_MONEY: 'ORANGE_CMR',
  MTN_MOMO_CMR: 'MTN_MOMO_CMR',
  ORANGE_CMR: 'ORANGE_CMR',
};

// Mapping KPay -> Prisma enum MobileMoneyProvider
const PROVIDER_TO_PRISMA: Record<string, string> = {
  MTN_MOMO_CMR: 'MTN_MOMO',
  ORANGE_CMR: 'ORANGE_MONEY',
  MTN_MOMO: 'MTN_MOMO',
  ORANGE_MONEY: 'ORANGE_MONEY',
};

@Injectable()
export class PawaPayService {
  private readonly logger = new Logger('KPayService');
  private readonly baseUrl = 'https://admin.kpay.site';
  private mode: 'live' | 'test' = 'test';
  private testApiKey = '';
  private testSecretKey = '';
  private liveApiKey = '';
  private liveSecretKey = '';
  private readonly currency = 'XAF';
  private enabledProviders: string[] = [];

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private smsService: SmsService,
    private whatsappService: WhatsappService,
    private accountingService: AccountingService,
  ) {
    // Charger depuis la DB au demarrage
    this.loadConfigFromDb().catch(() => {});
  }

  /** Retourne les cles actives selon le mode (live ou test) */
  private get apiKey(): string {
    return this.mode === 'live' ? this.liveApiKey : this.testApiKey;
  }

  private get secretKey(): string {
    return this.mode === 'live' ? this.liveSecretKey : this.testSecretKey;
  }

  /** Indique si on est en mode test */
  get isTestMode(): boolean {
    return this.mode !== 'live';
  }

  async loadConfigFromDb() {
    try {
      const settings = await this.prisma.setting.findMany({ where: { category: 'kpay' } });
      const map: Record<string, string> = {};
      for (const s of settings) map[s.key] = s.value;

      // Mode
      this.mode = (map['kpay_mode'] === 'live') ? 'live' : 'test';

      // Cles Test (retro-compatible avec ancien format kpay_api_key)
      this.testApiKey = map['kpay_test_api_key'] || map['kpay_api_key'] || '';
      this.testSecretKey = map['kpay_test_secret_key'] || map['kpay_secret_key'] || '';

      // Cles Live
      this.liveApiKey = map['kpay_live_api_key'] || '';
      this.liveSecretKey = map['kpay_live_secret_key'] || '';

      try { this.enabledProviders = JSON.parse(map['kpay_enabled_providers'] || '[]'); } catch { this.enabledProviders = []; }

      this.logger.log(`Config KPay chargee — mode: ${this.mode.toUpperCase()}, apiKey: ${this.apiKey ? '***' + this.apiKey.slice(-8) : 'non configure'}, providers: ${this.enabledProviders.length}`);
    } catch (e) {
      this.logger.warn(`Impossible de charger la config KPay depuis la DB: ${e.message}`);
    }
  }

  private get headers() {
    return {
      'X-API-Key': this.apiKey,
      'X-Secret-Key': this.secretKey,
      'Content-Type': 'application/json',
    };
  }

  private formatPhone(phone: string): string {
    // KPay attend le format international sans + : 237699123456
    return phone.replace(/^\+/, '').replace(/[\s\-\.]/g, '');
  }

  private resolveProvider(provider: string): string {
    return PROVIDER_MAP[provider] || provider;
  }

  private generateReference(): string {
    return `TXN-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  }

  // ==================== DEPOT (client envoie de l'argent vers GFS) ====================

  async initiateDeposit(params: {
    accountId: string;
    amount: number;
    phone: string;
    provider: string;
    agencyId: string;
    description?: string;
    initiatedBy?: string;
  }) {
    if (!this.apiKey) throw new BadRequestException('KPay non configure (KPAY_API_KEY manquant)');

    const account = await this.prisma.account.findUnique({
      where: { id: params.accountId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException('Compte non trouve');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Compte inactif');
    if (params.amount < 50) throw new BadRequestException('Montant minimum : 50 FCFA');

    const provider = this.resolveProvider(params.provider);
    if (this.enabledProviders.length > 0 && !this.enabledProviders.includes(provider)) {
      throw new BadRequestException(`Operateur ${provider} non active. Contactez l'administrateur.`);
    }
    const prismaProvider = PROVIDER_TO_PRISMA[provider] || PROVIDER_TO_PRISMA[params.provider] || 'MTN_MOMO';
    const externalId = `DEP-${uuidv4()}`;
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
        mobileMoneyProvider: prismaProvider as any,
        mobileMoneyPhone: params.phone,
        mobileMoneyRef: externalId,
        agencyId: params.agencyId,
        status: 'PENDING',
        isTest: this.isTestMode,
        description: params.description || `Depot Mobile Money ${PROVIDER_DISPLAY[provider] || provider}`,
      },
    });

    // Appel API KPay
    try {
      const body = {
        amount: Math.round(params.amount),
        provider,
        phoneNumber: this.formatPhone(params.phone),
        externalId,
        description: 'Depot aupres de GFSolutions',
      };

      this.logger.log(`[KPay] Depot initie: ${externalId} — ${params.amount} XAF — ${provider}`);

      const res = await fetch(`${this.baseUrl}/api/v1/payments/init`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      this.logger.log(`[KPay] Reponse depot: ${JSON.stringify(data)}`);

      if (!res.ok) {
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED', description: `Rejete: ${(data.message || 'ERREUR').slice(0, 180)}` },
        });
        throw new BadRequestException(`Depot rejete: ${data.message || 'Erreur KPay'}`);
      }

      // Mettre a jour avec l'ID KPay
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { mobileMoneyRef: data.id || externalId, isTest: !!data.isTest },
      });

      return {
        success: true,
        paymentId: data.id,
        transactionId: transaction.id,
        reference,
        status: data.status,
        message: 'Demande de depot envoyee. Le client doit confirmer sur son telephone.',
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`[KPay] Erreur depot: ${err.message}`);
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('Erreur communication KPay: ' + err.message);
    }
  }

  // ==================== RETRAIT (GFS envoie de l'argent au client) ====================

  async initiatePayout(params: {
    accountId: string;
    amount: number;
    phone: string;
    provider: string;
    agencyId: string;
    description?: string;
  }) {
    if (!this.apiKey) throw new BadRequestException('KPay non configure (KPAY_API_KEY manquant)');

    const account = await this.prisma.account.findUnique({
      where: { id: params.accountId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException('Compte non trouve');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Compte inactif');
    if (params.amount < 100) throw new BadRequestException('Montant minimum retrait : 100 FCFA');
    if (Number(account.balance) < params.amount) throw new BadRequestException('Solde insuffisant');

    const provider = this.resolveProvider(params.provider);
    if (this.enabledProviders.length > 0 && !this.enabledProviders.includes(provider)) {
      throw new BadRequestException(`Operateur ${provider} non active. Contactez l'administrateur.`);
    }
    const prismaProvider = PROVIDER_TO_PRISMA[provider] || PROVIDER_TO_PRISMA[params.provider] || 'MTN_MOMO';
    const externalId = `WDR-${uuidv4()}`;
    const reference = this.generateReference();

    // Debiter le compte immediatement (fonds reserves)
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
        mobileMoneyProvider: prismaProvider as any,
        mobileMoneyPhone: params.phone,
        mobileMoneyRef: externalId,
        agencyId: params.agencyId,
        status: 'PENDING',
        isTest: this.isTestMode,
        description: params.description || `Retrait Mobile Money ${PROVIDER_DISPLAY[provider] || provider}`,
      },
    });

    try {
      const body = {
        amount: Math.round(params.amount),
        provider,
        phoneNumber: this.formatPhone(params.phone),
        externalId,
        description: 'Retrait aupres de GFSolutions',
      };

      this.logger.log(`[KPay] Retrait initie: ${externalId} — ${params.amount} XAF — ${provider}`);

      const res = await fetch(`${this.baseUrl}/api/v1/payments/withdraw`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      this.logger.log(`[KPay] Reponse retrait: ${JSON.stringify(data)}`);

      if (!res.ok) {
        // Reverser le debit
        await this.prisma.account.update({
          where: { id: params.accountId },
          data: { balance: { increment: params.amount } },
        });
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED', description: `Rejete: ${(data.message || 'ERREUR').slice(0, 180)}` },
        });
        throw new BadRequestException(`Retrait rejete: ${data.message || 'Erreur KPay'}`);
      }

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { mobileMoneyRef: data.id || externalId, isTest: !!data.isTest },
      });

      return {
        success: true,
        withdrawalId: data.id,
        transactionId: transaction.id,
        reference,
        status: data.status,
        message: 'Retrait initie. Transfert en cours vers le Mobile Money.',
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
      throw new BadRequestException('Erreur communication KPay: ' + err.message);
    }
  }

  // ==================== POLLING JOB — VERIFICATION STATUTS TRANSACTIONS PENDING ====================

  /**
   * Appelee par le SchedulerService toutes les 30 secondes.
   * Recupere toutes les transactions PENDING liees a KPay et verifie leur statut via l'API.
   */
  async pollPendingTransactions() {
    const pendingTxns = await this.prisma.transaction.findMany({
      where: {
        status: 'PENDING',
        mobileMoneyRef: { not: null },
        // Seulement les transactions Mobile Money (ont un mobileMoneyProvider)
        mobileMoneyProvider: { not: null },
        // Ne pas verifier les transactions de plus de 24h (expirées)
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: {
        toAccount: { include: { client: true } },
        fromAccount: { include: { client: true } },
      },
    });

    if (pendingTxns.length === 0) return;

    this.logger.log(`[KPay Poll] ${pendingTxns.length} transaction(s) PENDING a verifier`);

    for (const transaction of pendingTxns) {
      try {
        await this.checkAndUpdateTransactionStatus(transaction);
      } catch (err) {
        this.logger.warn(`[KPay Poll] Erreur verification ${transaction.reference}: ${err.message}`);
      }
    }
  }

  /**
   * Verifie le statut d'une transaction aupres de KPay et met a jour en consequence.
   */
  private async checkAndUpdateTransactionStatus(transaction: any) {
    if (!this.apiKey || !transaction.mobileMoneyRef) return;

    const isDeposit = transaction.type === 'DEPOSIT';
    const paymentId = transaction.mobileMoneyRef;

    // Appel API KPay pour verifier le statut
    let data: any;
    try {
      const url = isDeposit
        ? `${this.baseUrl}/api/v1/payments/${paymentId}`
        : `${this.baseUrl}/api/v1/payments/withdraw/${paymentId}`;

      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        // Si 404, essayer avec l'autre endpoint (externalId vs paymentId)
        if (res.status === 404) return;
        return;
      }
      data = await res.json();
    } catch {
      return; // Erreur reseau, on reessaie au prochain cycle
    }

    const status = data.status;
    if (!status || status === 'PENDING' || status === 'INITIATED' || status === 'PROCESSING') {
      return; // Pas encore de resolution, on reessaie plus tard
    }

    this.logger.log(`[KPay Poll] ${transaction.reference} → ${status}`);

    if (status === 'COMPLETED' || status === 'SUCCESSFUL') {
      await this.handleTransactionCompleted(transaction, isDeposit);
    } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
      await this.handleTransactionFailed(transaction, isDeposit, data.failureReason || data.reason || status);
    }
  }

  private async handleTransactionCompleted(transaction: any, isDeposit: boolean) {
    if (isDeposit) {
      // Crediter le compte
      await this.prisma.account.update({
        where: { id: transaction.toAccountId! },
        data: { balance: { increment: Number(transaction.amount) } },
      });

      await this.prisma.transaction.update({
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
          true,
        );
      } catch (e) {
        this.logger.warn(`[COMPTA] Echec ecriture depot MM: ${e.message}`);
      }

      // Alertes SMS + WhatsApp
      if (transaction.toAccount?.client?.phone) {
        const balance = await this.prisma.account.findUnique({
          where: { id: transaction.toAccountId! },
          select: { balance: true, accountNumber: true },
        });
        const phone = transaction.toAccount.client.phone;
        const accNum = balance?.accountNumber || '';
        const amt = Number(transaction.amount);
        const bal = Number(balance?.balance || 0);

        this.smsService.sendDepositAlert(phone, accNum, amt, bal).catch(() => {});
        this.whatsappService.sendDepositAlert(phone, accNum, amt, bal).catch(() => {});
      }

      this.logger.log(`[KPay Poll] Depot COMPLETE: ${transaction.reference} — ${transaction.amount} XAF`);
    } else {
      // Retrait confirme (le debit a deja ete fait a l'initiation)
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
      });

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
        this.logger.warn(`[COMPTA] Echec ecriture retrait MM: ${e.message}`);
      }

      if (transaction.fromAccount?.client?.phone) {
        const account = await this.prisma.account.findUnique({
          where: { id: transaction.fromAccountId! },
          select: { balance: true, accountNumber: true },
        });
        const phone = transaction.fromAccount.client.phone;
        const accNum = account?.accountNumber || '';
        const amt = Number(transaction.amount);
        const bal = Number(account?.balance || 0);

        this.smsService.sendWithdrawalAlert(phone, accNum, amt, bal).catch(() => {});
        this.whatsappService.sendWithdrawalAlert(phone, accNum, amt, bal).catch(() => {});
      }

      this.logger.log(`[KPay Poll] Retrait COMPLETE: ${transaction.reference}`);
    }
  }

  private async handleTransactionFailed(transaction: any, isDeposit: boolean, reason: string) {
    if (!isDeposit) {
      // Reverser le debit pour les retraits echoues
      await this.prisma.account.update({
        where: { id: transaction.fromAccountId! },
        data: { balance: { increment: Number(transaction.amount) } },
      });
      this.logger.warn(`[KPay Poll] Retrait ECHEC + remboursement: ${transaction.reference}`);
    }

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED', description: `Echec: ${(reason || 'INCONNU').slice(0, 180)}` },
    });

    this.logger.warn(`[KPay Poll] ${isDeposit ? 'Depot' : 'Retrait'} ECHEC: ${transaction.reference} — ${reason}`);
  }

  /**
   * Expire les transactions PENDING de plus de 24h
   */
  async expireOldPendingTransactions() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expired = await this.prisma.transaction.findMany({
      where: {
        status: 'PENDING',
        mobileMoneyProvider: { not: null },
        createdAt: { lt: cutoff },
      },
    });

    for (const txn of expired) {
      // Pour les retraits expirés, reverser le debit
      if (txn.type === 'WITHDRAWAL' && txn.fromAccountId) {
        await this.prisma.account.update({
          where: { id: txn.fromAccountId },
          data: { balance: { increment: Number(txn.amount) } },
        });
      }

      await this.prisma.transaction.update({
        where: { id: txn.id },
        data: { status: 'FAILED', description: 'Expire: pas de confirmation dans les 24h' },
      });

      this.logger.warn(`[KPay Poll] Transaction expiree: ${txn.reference}`);
    }

    if (expired.length > 0) {
      this.logger.log(`[KPay Poll] ${expired.length} transaction(s) expiree(s)`);
    }
  }

  // ==================== STATUT ====================

  async getDepositStatus(paymentId: string) {
    if (!this.apiKey) return { configured: false };
    const res = await fetch(`${this.baseUrl}/api/v1/payments/${paymentId}`, {
      headers: this.headers,
    });
    return res.json();
  }

  async getPayoutStatus(withdrawalId: string) {
    if (!this.apiKey) return { configured: false };
    const res = await fetch(`${this.baseUrl}/api/v1/payments/withdraw/${withdrawalId}`, {
      headers: this.headers,
    });
    return res.json();
  }

  // ==================== SOLDE MARCHAND ====================

  async getMerchantBalance() {
    if (!this.apiKey) return { configured: false, message: 'KPay non configure' };
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/balance`, { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        return { configured: true, ...data };
      }
      // Si pas d'endpoint balance, tenter /api/v1/account/balance
      const res2 = await fetch(`${this.baseUrl}/api/v1/account/balance`, { headers: this.headers });
      if (res2.ok) {
        const data2 = await res2.json();
        return { configured: true, ...data2 };
      }
      return { configured: true, balance: null, message: 'Endpoint solde non disponible. Consultez kpay.site.' };
    } catch (e) {
      this.logger.warn(`[KPay] Erreur balance: ${e.message}`);
      return { configured: true, balance: null, error: e.message };
    }
  }

  async topUpMerchantBalance(params: { amount: number; phone: string; provider: string }) {
    if (!this.apiKey) throw new BadRequestException('KPay non configure');
    if (params.amount < 100) throw new BadRequestException('Montant minimum : 100 FCFA');

    const provider = this.resolveProvider(params.provider);
    const externalId = `TOPUP-${uuidv4()}`;

    const body = {
      amount: Math.round(params.amount),
      provider,
      phoneNumber: this.formatPhone(params.phone),
      externalId,
      description: 'Approvisionnement compte GFSolutions',
    };

    this.logger.log(`[KPay] Recharge marchand initiee: ${externalId} — ${params.amount} XAF — ${provider}`);

    const res = await fetch(`${this.baseUrl}/api/v1/payments/init`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    this.logger.log(`[KPay] Reponse recharge: ${JSON.stringify(data)}`);

    if (!res.ok) {
      throw new BadRequestException(`Recharge rejetee: ${data.message || 'Erreur KPay'}`);
    }

    return {
      success: true,
      paymentId: data.id,
      externalId,
      status: data.status,
      amount: params.amount,
      message: 'Demande de recharge envoyee. Confirmez sur votre telephone.',
    };
  }

  async getTopUpStatus(paymentId: string) {
    return this.getDepositStatus(paymentId);
  }

  // ==================== DISPONIBILITE ====================

  async getAvailability() {
    if (!this.apiKey) return { configured: false, message: 'KPay non configure' };
    const allProviders = [
      { code: 'MTN_MOMO_CMR', name: 'MTN MoMo', country: 'CMR', currency: 'XAF' },
      { code: 'ORANGE_CMR', name: 'Orange Money', country: 'CMR', currency: 'XAF' },
      { code: 'ORANGE_SEN', name: 'Orange Money', country: 'SEN', currency: 'XOF' },
      { code: 'WAVE_SEN', name: 'Wave', country: 'SEN', currency: 'XOF' },
      { code: 'FREE_SEN', name: 'Free Money', country: 'SEN', currency: 'XOF' },
      { code: 'MTN_MOMO_CIV', name: 'MTN MoMo', country: 'CIV', currency: 'XOF' },
      { code: 'ORANGE_CIV', name: 'Orange Money', country: 'CIV', currency: 'XOF' },
      { code: 'WAVE_CIV', name: 'Wave', country: 'CIV', currency: 'XOF' },
      { code: 'MOOV_CIV', name: 'Moov Money', country: 'CIV', currency: 'XOF' },
      { code: 'MPESA_KEN', name: 'M-Pesa', country: 'KEN', currency: 'KES' },
      { code: 'MTN_MOMO_GHA', name: 'MTN MoMo', country: 'GHA', currency: 'GHS' },
    ];
    const providers = this.enabledProviders.length > 0
      ? allProviders.filter(p => this.enabledProviders.includes(p.code))
      : allProviders.filter(p => ['MTN_MOMO_CMR', 'ORANGE_CMR'].includes(p.code));
    return { configured: true, enabledProviders: this.enabledProviders, providers };
  }
}
