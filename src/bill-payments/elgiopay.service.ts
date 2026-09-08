import { Injectable, Logger, BadRequestException, HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ElgioPayConfig {
  secretToken: string;
  baseUrl: string;
  enabled: boolean;
}

export interface BillService {
  code: string;
  name: string;
  category: string;
  type: string;
  description: string;
}

export interface BillLookupResult {
  serviceCode: string;
  customerName: string;
  customerNumber: string;
  amount: number;
  currency: string;
  serviceName?: string;
  items?: any[];
  raw: any;
}

export interface BillPayResult {
  reference: string;
  status: string;
  message: string;
  raw: any;
}

@Injectable()
export class ElgioPayService {
  private readonly logger = new Logger(ElgioPayService.name);
  private config: ElgioPayConfig;

  constructor(private prisma: PrismaService) {
    this.config = {
      secretToken: process.env.ELGIOPAY_SECRET_TOKEN || '',
      baseUrl: process.env.ELGIOPAY_BASE_URL || 'https://sandbox-api.elgiopay.com',
      enabled: true,
    };
    this.loadConfigFromDb();
  }

  async loadConfigFromDb() {
    try {
      const settings = await this.prisma.setting.findMany({ where: { category: 'elgiopay' } });
      const map: Record<string, string> = {};
      for (const s of settings) map[s.key] = s.value;

      const mode = map['elgiopay_mode'] || 'sandbox';

      // Utiliser la cle correspondant au mode
      if (mode === 'production' && map['elgiopay_live_secret_token']) {
        this.config.secretToken = map['elgiopay_live_secret_token'];
        this.config.baseUrl = 'https://api.elgiopay.com';
      } else if (map['elgiopay_secret_token']) {
        this.config.secretToken = map['elgiopay_secret_token'];
        this.config.baseUrl = 'https://sandbox-api.elgiopay.com';
      }

      // Override si une URL specifique est configuree
      if (map['elgiopay_base_url']) this.config.baseUrl = map['elgiopay_base_url'];
      if (map['elgiopay_enabled'] !== undefined) this.config.enabled = map['elgiopay_enabled'] !== 'false';

      this.logger.log(`ElgioPay config loaded from DB (configured: ${this.isConfigured()})`);
    } catch (e) {
      this.logger.warn('Could not load ElgioPay config from DB, using env vars');
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.secretToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private async apiRequest(method: string, path: string, body?: any): Promise<any> {
    if (!this.config.secretToken) {
      throw new BadRequestException('ElgioPay API non configuree. Veuillez definir ELGIOPAY_SECRET_TOKEN.');
    }

    const url = `${this.config.baseUrl}${path}`;
    const headers = this.getHeaders();

    try {
      this.logger.log(`ElgioPay ${method} ${path}`);
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(`ElgioPay API error: ${response.status} - ${JSON.stringify(data)}`);
        // Ne jamais retourner 401/403 au frontend (sinon l'intercepteur axios deconnecte l'utilisateur)
        const safeStatus = (response.status === 401 || response.status === 403) ? 502 : response.status;
        throw new HttpException(
          data?.message || data?.error || `Erreur ElgioPay (${response.status})`,
          safeStatus,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`ElgioPay request failed: ${error.message}`);
      throw new BadRequestException(`Erreur de connexion ElgioPay: ${error.message}`);
    }
  }

  /**
   * List available bill services (ENEO, CamWater, Canal+, etc.)
   * GET /api/v1/bills?category=electricity|water|tv
   */
  async listServices(category?: string): Promise<any> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const data = await this.apiRequest('GET', `/api/v1/bills${query}`);
    return data?.data?.services || data?.data || data;
  }

  /**
   * Look up a bill / get bill details
   * POST /api/v1/bills/get-bill
   */
  async getBill(serviceCode: string, subscriberNumber: string): Promise<BillLookupResult> {
    const data = await this.apiRequest('POST', '/api/v1/bills/get-bill', {
      service_code: serviceCode,
      bill_number: subscriberNumber,
      account_number: subscriberNumber,
    });

    const bill = data?.data || data;
    const billItems = bill?.bill_info || [];
    const firstItem = billItems[0] || {};

    // Calculer le total de toutes les factures
    const totalAmount = billItems.reduce((sum: number, item: any) => sum + Number(item.amountLocalCur || item.amount || 0), 0);

    // Formatter chaque facture
    const items = billItems.map((item: any) => ({
      payItemId: item.payItemId || '',
      billNumber: item.billNumber || '',
      amount: Number(item.amountLocalCur || item.amount || 0),
      description: item.payItemDescr || '',
      billType: item.billType || '',
      billMonth: item.billMonth || '',
      billYear: item.billYear || '',
      billDate: item.billDate || '',
      billDueDate: item.billDueDate || '',
      penaltyAmount: Number(item.penaltyAmount || 0),
    }));

    return {
      serviceCode: serviceCode,
      customerName: firstItem.customerName || firstItem.customer_name || bill.customer_name || bill.customerName || bill.service || '',
      customerNumber: firstItem.customerNumber || bill.account_number || bill.bill_number || subscriberNumber,
      amount: totalAmount,
      currency: firstItem.localCur || bill.currency || 'XAF',
      serviceName: bill.service || '',
      items,
      raw: bill,
    };
  }

  /**
   * Pay a bill
   * POST /api/v1/bills/pay
   */
  async payBill(serviceCode: string, subscriberNumber: string, amount: number, phone?: string): Promise<BillPayResult> {
    const data = await this.apiRequest('POST', '/api/v1/bills/pay', {
      service_code: serviceCode,
      bill_number: subscriberNumber,
      amount,
      account_number: subscriberNumber,
      customer_phone: phone || subscriberNumber,
    });

    const result = data?.data || data;

    return {
      reference: result.reference || result.transaction_id || result.id || '',
      status: result.status || 'PENDING',
      message: result.message || 'Paiement initie',
      raw: result,
    };
  }

  /**
   * Get account balance
   * GET /api/v1/balance (or similar)
   */
  async getBalance(): Promise<any> {
    try {
      return await this.apiRequest('GET', '/api/v1/balance');
    } catch {
      return { balance: null, message: 'Endpoint balance non disponible' };
    }
  }

  /**
   * Initiate a payment (collect money via Mobile Money to fund ElgioPay account)
   * POST /api/v1/payments
   */
  async initiatePayment(dto: {
    amount: number;
    customerPhone: string;
    paymentMethod: 'mtn_mobile_money' | 'orange_money';
    customerName?: string;
    customerEmail?: string;
    reference?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    const payload: any = {
      amount: dto.amount,
      currency: 'XAF',
      payment_method: dto.paymentMethod,
      customer_phone: dto.customerPhone,
      reference: dto.reference || `GFS-RECHARGE-${Date.now()}`,
    };
    if (dto.customerName) payload.customer_name = dto.customerName;
    if (dto.customerEmail) payload.customer_email = dto.customerEmail;
    if (dto.metadata && Object.keys(dto.metadata).length > 0) payload.metadata = dto.metadata;

    const data = await this.apiRequest('POST', '/api/v1/payments', payload);
    return data;
  }

  /**
   * Get payment status
   * GET /api/v1/payments/:transactionId
   */
  async getPaymentStatus(transactionId: string): Promise<any> {
    return this.apiRequest('GET', `/api/v1/payments/${transactionId}`);
  }

  /**
   * Verify a payment (force live verification)
   * POST /api/v1/payments/:transactionId/verify
   */
  async verifyPayment(transactionId: string): Promise<any> {
    return this.apiRequest('POST', `/api/v1/payments/${transactionId}/verify`);
  }

  /**
   * Check if ElgioPay is configured
   */
  isConfigured(): boolean {
    return !!(this.config.secretToken && this.config.enabled);
  }
}
