// Mock uuid before any import that uses it
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PawaPayService } from './pawapay.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { SmsService } from '../sms/sms.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AccountingService } from '../accounting/accounting.service';

// ---------- Mock global fetch ----------
const mockFetchResponse = (data: any, ok = true, status = 200) => ({
  ok,
  status,
  json: jest.fn().mockResolvedValue(data),
});

let mockFetch: jest.Mock;

beforeAll(() => {
  mockFetch = jest.fn();
  (global as any).fetch = mockFetch;
});

afterAll(() => {
  delete (global as any).fetch;
});

// ---------- Mock factories ----------
const mockPrisma = () => ({
  setting: { findMany: jest.fn().mockResolvedValue([]) },
  account: { findUnique: jest.fn(), update: jest.fn() },
  transaction: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
});

const mockConfigService = () => ({
  get: jest.fn(),
});

const mockSmsService = () => ({
  sendDepositAlert: jest.fn().mockResolvedValue(undefined),
  sendWithdrawalAlert: jest.fn().mockResolvedValue(undefined),
});

const mockWhatsappService = () => ({
  sendDepositAlert: jest.fn().mockResolvedValue(undefined),
  sendWithdrawalAlert: jest.fn().mockResolvedValue(undefined),
});

const mockAccountingService = () => ({
  recordDeposit: jest.fn().mockResolvedValue(undefined),
  recordWithdrawal: jest.fn().mockResolvedValue(undefined),
});

// ---------- Test data ----------
const ACCOUNT_ACTIVE = {
  id: 'acc-1',
  status: 'ACTIVE',
  balance: 100000,
  accountNumber: 'GFS-001',
  client: { id: 'client-1', phone: '237699000000' },
};

const DEPOSIT_PARAMS = {
  accountId: 'acc-1',
  amount: 5000,
  phone: '+237699123456',
  provider: 'MTN_MOMO',
  agencyId: 'agency-1',
  description: 'Test depot',
};

const PAYOUT_PARAMS = {
  accountId: 'acc-1',
  amount: 3000,
  phone: '237699123456',
  provider: 'ORANGE_MONEY',
  agencyId: 'agency-1',
};

describe('PawaPayService', () => {
  let service: PawaPayService;
  let prisma: ReturnType<typeof mockPrisma>;
  let sms: ReturnType<typeof mockSmsService>;
  let whatsapp: ReturnType<typeof mockWhatsappService>;
  let accounting: ReturnType<typeof mockAccountingService>;

  beforeEach(async () => {
    prisma = mockPrisma();
    sms = mockSmsService();
    whatsapp = mockWhatsappService();
    accounting = mockAccountingService();

    // Return settings that configure the service with test keys
    prisma.setting.findMany.mockResolvedValue([
      { key: 'kpay_mode', value: 'test', category: 'kpay' },
      { key: 'kpay_test_api_key', value: 'test-api-key-12345678', category: 'kpay' },
      { key: 'kpay_test_secret_key', value: 'test-secret-key-12345678', category: 'kpay' },
      { key: 'kpay_enabled_providers', value: '["MTN_MOMO_CMR","ORANGE_CMR"]', category: 'kpay' },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PawaPayService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useFactory: mockConfigService },
        { provide: SmsService, useValue: sms },
        { provide: WhatsappService, useValue: whatsapp },
        { provide: AccountingService, useValue: accounting },
      ],
    }).compile();

    service = module.get<PawaPayService>(PawaPayService);
    // Force config reload so keys are set
    await service.loadConfigFromDb();

    mockFetch.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== loadConfigFromDb ====================

  describe('loadConfigFromDb', () => {
    it('should load settings from database and set mode to test', async () => {
      await service.loadConfigFromDb();
      expect(service.isTestMode).toBe(true);
      expect(prisma.setting.findMany).toHaveBeenCalledWith({ where: { category: 'kpay' } });
    });

    it('should set live mode when kpay_mode is live', async () => {
      prisma.setting.findMany.mockResolvedValue([
        { key: 'kpay_mode', value: 'live', category: 'kpay' },
        { key: 'kpay_live_api_key', value: 'live-key', category: 'kpay' },
        { key: 'kpay_live_secret_key', value: 'live-secret', category: 'kpay' },
      ]);
      await service.loadConfigFromDb();
      expect(service.isTestMode).toBe(false);
    });

    it('should handle DB errors gracefully', async () => {
      prisma.setting.findMany.mockRejectedValue(new Error('DB down'));
      await expect(service.loadConfigFromDb()).resolves.not.toThrow();
    });
  });

  // ==================== initiateDeposit ====================

  describe('initiateDeposit', () => {
    it('should throw if API key is not configured', async () => {
      // Reset config to empty
      prisma.setting.findMany.mockResolvedValue([]);
      await service.loadConfigFromDb();

      await expect(service.initiateDeposit(DEPOSIT_PARAMS))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if account does not exist', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(service.initiateDeposit(DEPOSIT_PARAMS))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if account is inactive', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...ACCOUNT_ACTIVE, status: 'CLOSED' });

      await expect(service.initiateDeposit(DEPOSIT_PARAMS))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if amount is less than 50 FCFA', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);

      await expect(service.initiateDeposit({ ...DEPOSIT_PARAMS, amount: 30 }))
        .rejects.toThrow('Montant minimum : 50 FCFA');
    });

    it('should throw BadRequestException if provider is not enabled', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);

      await expect(service.initiateDeposit({ ...DEPOSIT_PARAMS, provider: 'MPESA_KEN' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should create transaction and call KPay API on successful deposit', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.transaction.create.mockResolvedValue({
        id: 'txn-1',
        reference: 'TXN-123',
        status: 'PENDING',
      });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'kpay-payment-123', status: 'INITIATED', isTest: true }),
      );

      const result = await service.initiateDeposit(DEPOSIT_PARAMS);

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('kpay-payment-123');
      expect(result.transactionId).toBe('txn-1');
      expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://admin.kpay.site/api/v1/payments/init',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should map MTN_MOMO provider to MTN_MOMO_CMR in API call', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.transaction.create.mockResolvedValue({ id: 'txn-1', reference: 'TXN-123' });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'kpay-1', status: 'INITIATED' }),
      );

      await service.initiateDeposit({ ...DEPOSIT_PARAMS, provider: 'MTN_MOMO' });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.provider).toBe('MTN_MOMO_CMR');
    });

    it('should format phone number by removing + and spaces', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.transaction.create.mockResolvedValue({ id: 'txn-1', reference: 'TXN-123' });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'kpay-1', status: 'INITIATED' }),
      );

      await service.initiateDeposit({ ...DEPOSIT_PARAMS, phone: '+237 699-123.456' });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.phoneNumber).toBe('237699123456');
    });

    it('should mark transaction as FAILED when KPay returns error', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.transaction.create.mockResolvedValue({ id: 'txn-1', reference: 'TXN-123' });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockResolvedValue(
        mockFetchResponse({ message: 'Insufficient balance' }, false, 400),
      );

      await expect(service.initiateDeposit(DEPOSIT_PARAMS))
        .rejects.toThrow('Depot rejete: Insufficient balance');

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'txn-1' },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('should mark transaction as FAILED on network error', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.transaction.create.mockResolvedValue({ id: 'txn-1', reference: 'TXN-123' });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockRejectedValue(new Error('Network timeout'));

      await expect(service.initiateDeposit(DEPOSIT_PARAMS))
        .rejects.toThrow('Erreur communication KPay: Network timeout');

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });

  // ==================== initiatePayout (withdrawal) ====================

  describe('initiatePayout', () => {
    it('should throw if API key is not configured', async () => {
      prisma.setting.findMany.mockResolvedValue([]);
      await service.loadConfigFromDb();

      await expect(service.initiatePayout(PAYOUT_PARAMS))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if account does not exist', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(service.initiatePayout(PAYOUT_PARAMS))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw if account is inactive', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...ACCOUNT_ACTIVE, status: 'FROZEN' });

      await expect(service.initiatePayout(PAYOUT_PARAMS))
        .rejects.toThrow('Compte inactif');
    });

    it('should throw if amount is less than 100 FCFA', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);

      await expect(service.initiatePayout({ ...PAYOUT_PARAMS, amount: 50 }))
        .rejects.toThrow('Montant minimum retrait : 100 FCFA');
    });

    it('should throw if balance is insufficient', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...ACCOUNT_ACTIVE, balance: 1000 });

      await expect(service.initiatePayout({ ...PAYOUT_PARAMS, amount: 5000 }))
        .rejects.toThrow('Solde insuffisant');
    });

    it('should debit account, create transaction, and call KPay API', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.account.update.mockResolvedValue({});
      prisma.transaction.create.mockResolvedValue({
        id: 'txn-2',
        reference: 'TXN-456',
        status: 'PENDING',
      });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'kpay-wd-123', status: 'PROCESSING', isTest: true }),
      );

      const result = await service.initiatePayout(PAYOUT_PARAMS);

      expect(result.success).toBe(true);
      expect(result.withdrawalId).toBe('kpay-wd-123');
      // Account should be debited
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: { balance: { decrement: 3000 } },
        }),
      );
      // API call to withdraw endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        'https://admin.kpay.site/api/v1/payments/withdraw',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should map ORANGE_MONEY to ORANGE_CMR in API call', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.account.update.mockResolvedValue({});
      prisma.transaction.create.mockResolvedValue({ id: 'txn-2', reference: 'TXN-456' });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'kpay-wd-1', status: 'PROCESSING' }),
      );

      await service.initiatePayout({ ...PAYOUT_PARAMS, provider: 'ORANGE_MONEY' });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.provider).toBe('ORANGE_CMR');
    });

    it('should reverse debit and mark FAILED when KPay rejects', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.account.update.mockResolvedValue({});
      prisma.transaction.create.mockResolvedValue({ id: 'txn-2', reference: 'TXN-456' });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockResolvedValue(
        mockFetchResponse({ message: 'Provider unavailable' }, false, 503),
      );

      await expect(service.initiatePayout(PAYOUT_PARAMS))
        .rejects.toThrow('Retrait rejete: Provider unavailable');

      // Verify balance was decremented then incremented back
      const updateCalls = prisma.account.update.mock.calls;
      expect(updateCalls).toHaveLength(2);
      expect(updateCalls[0][0].data).toEqual({ balance: { decrement: 3000 } });
      expect(updateCalls[1][0].data).toEqual({ balance: { increment: 3000 } });
    });

    it('should reverse debit on network error', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT_ACTIVE);
      prisma.account.update.mockResolvedValue({});
      prisma.transaction.create.mockResolvedValue({ id: 'txn-2', reference: 'TXN-456' });
      prisma.transaction.update.mockResolvedValue({});

      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await expect(service.initiatePayout(PAYOUT_PARAMS))
        .rejects.toThrow('Erreur communication KPay: Connection refused');

      // Should have 2 account updates: decrement + increment (reversal)
      expect(prisma.account.update).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== getDepositStatus ====================

  describe('getDepositStatus', () => {
    it('should return not configured when API key is missing', async () => {
      prisma.setting.findMany.mockResolvedValue([]);
      await service.loadConfigFromDb();

      const result = await service.getDepositStatus('some-id');
      expect(result).toEqual({ configured: false });
    });

    it('should call KPay API and return status', async () => {
      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'kpay-1', status: 'COMPLETED', amount: 5000 }),
      );

      const result = await service.getDepositStatus('kpay-1');

      expect(result).toEqual({ id: 'kpay-1', status: 'COMPLETED', amount: 5000 });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://admin.kpay.site/api/v1/payments/kpay-1',
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  // ==================== getPayoutStatus ====================

  describe('getPayoutStatus', () => {
    it('should return not configured when API key is missing', async () => {
      prisma.setting.findMany.mockResolvedValue([]);
      await service.loadConfigFromDb();

      const result = await service.getPayoutStatus('some-id');
      expect(result).toEqual({ configured: false });
    });

    it('should call KPay withdraw status endpoint', async () => {
      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'wd-1', status: 'COMPLETED' }),
      );

      const result = await service.getPayoutStatus('wd-1');

      expect(result.status).toBe('COMPLETED');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://admin.kpay.site/api/v1/payments/withdraw/wd-1',
        expect.any(Object),
      );
    });
  });

  // ==================== getMerchantBalance ====================

  describe('getMerchantBalance', () => {
    it('should return not configured when API key is missing', async () => {
      prisma.setting.findMany.mockResolvedValue([]);
      await service.loadConfigFromDb();

      const result = await service.getMerchantBalance();
      expect(result).toEqual({ configured: false, message: 'KPay non configure' });
    });

    it('should return balance from /api/v1/balance', async () => {
      mockFetch.mockResolvedValue(
        mockFetchResponse({ balance: 250000, currency: 'XAF' }),
      );

      const result = await service.getMerchantBalance();

      expect(result.configured).toBe(true);
      expect(result.balance).toBe(250000);
    });

    it('should fallback to /api/v1/account/balance if first endpoint fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({}, false, 404))
        .mockResolvedValueOnce(mockFetchResponse({ balance: 150000 }));

      const result = await service.getMerchantBalance();

      expect(result.configured).toBe(true);
      expect(result.balance).toBe(150000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return message when both balance endpoints fail', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFetchResponse({}, false, 404))
        .mockResolvedValueOnce(mockFetchResponse({}, false, 404));

      const result = await service.getMerchantBalance();

      expect(result.configured).toBe(true);
      expect(result.balance).toBeNull();
    });

    it('should handle network error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.getMerchantBalance();

      expect(result.configured).toBe(true);
      expect(result.error).toBe('ECONNREFUSED');
    });
  });

  // ==================== topUpMerchantBalance ====================

  describe('topUpMerchantBalance', () => {
    it('should throw if API key is not configured', async () => {
      prisma.setting.findMany.mockResolvedValue([]);
      await service.loadConfigFromDb();

      await expect(
        service.topUpMerchantBalance({ amount: 1000, phone: '237699000000', provider: 'MTN_MOMO' }),
      ).rejects.toThrow('KPay non configure');
    });

    it('should throw if amount is less than 100 FCFA', async () => {
      await expect(
        service.topUpMerchantBalance({ amount: 50, phone: '237699000000', provider: 'MTN_MOMO' }),
      ).rejects.toThrow('Montant minimum : 100 FCFA');
    });

    it('should call KPay payment init endpoint for top-up', async () => {
      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'topup-1', status: 'INITIATED' }),
      );

      const result = await service.topUpMerchantBalance({
        amount: 50000,
        phone: '237699000000',
        provider: 'MTN_MOMO',
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('topup-1');
      expect(result.amount).toBe(50000);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.amount).toBe(50000);
      expect(body.provider).toBe('MTN_MOMO_CMR');
      expect(body.description).toContain('GFSolutions');
    });

    it('should throw when KPay rejects the top-up', async () => {
      mockFetch.mockResolvedValue(
        mockFetchResponse({ message: 'Limit exceeded' }, false, 400),
      );

      await expect(
        service.topUpMerchantBalance({ amount: 1000000, phone: '237699000000', provider: 'MTN_MOMO' }),
      ).rejects.toThrow('Recharge rejetee: Limit exceeded');
    });
  });

  // ==================== getTopUpStatus ====================

  describe('getTopUpStatus', () => {
    it('should delegate to getDepositStatus', async () => {
      mockFetch.mockResolvedValue(
        mockFetchResponse({ id: 'topup-1', status: 'COMPLETED' }),
      );

      const result = await service.getTopUpStatus('topup-1');

      expect(result.status).toBe('COMPLETED');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://admin.kpay.site/api/v1/payments/topup-1',
        expect.any(Object),
      );
    });
  });

  // ==================== getAvailability ====================

  describe('getAvailability', () => {
    it('should return not configured when API key is missing', async () => {
      prisma.setting.findMany.mockResolvedValue([]);
      await service.loadConfigFromDb();

      const result = await service.getAvailability();
      expect(result).toEqual({ configured: false, message: 'KPay non configure' });
    });

    it('should return only enabled providers', async () => {
      const result = await service.getAvailability();

      expect(result.configured).toBe(true);
      expect(result.providers).toHaveLength(2);
      expect(result.providers!.map((p: any) => p.code)).toEqual(
        expect.arrayContaining(['MTN_MOMO_CMR', 'ORANGE_CMR']),
      );
    });

    it('should default to CMR providers when no providers are configured', async () => {
      prisma.setting.findMany.mockResolvedValue([
        { key: 'kpay_mode', value: 'test', category: 'kpay' },
        { key: 'kpay_test_api_key', value: 'key', category: 'kpay' },
        { key: 'kpay_test_secret_key', value: 'secret', category: 'kpay' },
        { key: 'kpay_enabled_providers', value: '[]', category: 'kpay' },
      ]);
      await service.loadConfigFromDb();

      const result = await service.getAvailability();

      expect(result.configured).toBe(true);
      expect(result.providers).toHaveLength(2);
      expect(result.providers![0].country).toBe('CMR');
      expect(result.providers![1].country).toBe('CMR');
    });
  });

  // ==================== pollPendingTransactions ====================

  describe('pollPendingTransactions', () => {
    it('should do nothing when there are no pending transactions', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.pollPendingTransactions();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should check status for each pending deposit transaction', async () => {
      const pendingTxn = {
        id: 'txn-1',
        type: 'DEPOSIT',
        reference: 'TXN-100',
        mobileMoneyRef: 'kpay-dep-1',
        status: 'PENDING',
        amount: 5000,
        fees: 0,
        tax: 0,
        toAccountId: 'acc-1',
        agencyId: 'agency-1',
        toAccount: { id: 'acc-1', accountNumber: 'GFS-001', client: { phone: '237699000000' } },
        fromAccount: null,
      };
      prisma.transaction.findMany.mockResolvedValue([pendingTxn]);
      prisma.transaction.update.mockResolvedValue({});
      prisma.account.update.mockResolvedValue({});
      prisma.account.findUnique.mockResolvedValue({ balance: 105000, accountNumber: 'GFS-001' });

      mockFetch.mockResolvedValue(
        mockFetchResponse({ status: 'COMPLETED' }),
      );

      await service.pollPendingTransactions();

      // Should have called the deposit status endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        'https://admin.kpay.site/api/v1/payments/kpay-dep-1',
        expect.any(Object),
      );
      // Account should be credited
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { balance: { increment: 5000 } },
        }),
      );
      // Transaction should be marked COMPLETED
      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'COMPLETED' },
        }),
      );
    });

    it('should reverse debit for failed withdrawal transactions', async () => {
      const pendingTxn = {
        id: 'txn-2',
        type: 'WITHDRAWAL',
        reference: 'TXN-200',
        mobileMoneyRef: 'kpay-wd-1',
        status: 'PENDING',
        amount: 3000,
        fees: 0,
        tax: 0,
        fromAccountId: 'acc-1',
        agencyId: 'agency-1',
        toAccount: null,
        fromAccount: { id: 'acc-1', accountNumber: 'GFS-001', client: { phone: '237699000000' } },
      };
      prisma.transaction.findMany.mockResolvedValue([pendingTxn]);
      prisma.transaction.update.mockResolvedValue({});
      prisma.account.update.mockResolvedValue({});

      mockFetch.mockResolvedValue(
        mockFetchResponse({ status: 'FAILED', failureReason: 'Timeout' }),
      );

      await service.pollPendingTransactions();

      // Should reverse the debit
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: { balance: { increment: 3000 } },
        }),
      );
    });

    it('should skip transactions still in PENDING/INITIATED/PROCESSING status', async () => {
      const pendingTxn = {
        id: 'txn-3',
        type: 'DEPOSIT',
        reference: 'TXN-300',
        mobileMoneyRef: 'kpay-dep-3',
        status: 'PENDING',
        amount: 1000,
        toAccountId: 'acc-1',
        toAccount: { id: 'acc-1', client: { phone: '237699000000' } },
        fromAccount: null,
      };
      prisma.transaction.findMany.mockResolvedValue([pendingTxn]);

      mockFetch.mockResolvedValue(
        mockFetchResponse({ status: 'PROCESSING' }),
      );

      await service.pollPendingTransactions();

      // Transaction should NOT be updated
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('should send SMS and WhatsApp alerts on completed deposit', async () => {
      const pendingTxn = {
        id: 'txn-4',
        type: 'DEPOSIT',
        reference: 'TXN-400',
        mobileMoneyRef: 'kpay-dep-4',
        status: 'PENDING',
        amount: 10000,
        fees: 0,
        tax: 0,
        toAccountId: 'acc-1',
        agencyId: 'agency-1',
        toAccount: { id: 'acc-1', accountNumber: 'GFS-001', client: { phone: '237699000000' } },
        fromAccount: null,
      };
      prisma.transaction.findMany.mockResolvedValue([pendingTxn]);
      prisma.transaction.update.mockResolvedValue({});
      prisma.account.update.mockResolvedValue({});
      prisma.account.findUnique.mockResolvedValue({ balance: 110000, accountNumber: 'GFS-001' });

      mockFetch.mockResolvedValue(
        mockFetchResponse({ status: 'COMPLETED' }),
      );

      await service.pollPendingTransactions();

      expect(sms.sendDepositAlert).toHaveBeenCalledWith('237699000000', 'GFS-001', 10000, 110000);
      expect(whatsapp.sendDepositAlert).toHaveBeenCalledWith('237699000000', 'GFS-001', 10000, 110000);
    });

    it('should handle errors for individual transactions without stopping others', async () => {
      const txn1 = {
        id: 'txn-err',
        type: 'DEPOSIT',
        reference: 'TXN-ERR',
        mobileMoneyRef: 'kpay-err',
        status: 'PENDING',
        amount: 1000,
        toAccountId: 'acc-1',
        toAccount: null,
        fromAccount: null,
      };
      const txn2 = {
        id: 'txn-ok',
        type: 'DEPOSIT',
        reference: 'TXN-OK',
        mobileMoneyRef: 'kpay-ok',
        status: 'PENDING',
        amount: 2000,
        fees: 0,
        tax: 0,
        toAccountId: 'acc-2',
        agencyId: 'agency-1',
        toAccount: { id: 'acc-2', accountNumber: 'GFS-002', client: { phone: '237699111111' } },
        fromAccount: null,
      };
      prisma.transaction.findMany.mockResolvedValue([txn1, txn2]);
      prisma.transaction.update.mockResolvedValue({});
      prisma.account.update.mockResolvedValue({});
      prisma.account.findUnique.mockResolvedValue({ balance: 52000, accountNumber: 'GFS-002' });

      // First call throws, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockFetchResponse({ status: 'COMPLETED' }));

      await expect(service.pollPendingTransactions()).resolves.not.toThrow();
    });
  });

  // ==================== expireOldPendingTransactions ====================

  describe('expireOldPendingTransactions', () => {
    it('should do nothing when there are no expired transactions', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.expireOldPendingTransactions();

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('should mark old deposits as FAILED', async () => {
      const oldTxn = {
        id: 'txn-old',
        type: 'DEPOSIT',
        reference: 'TXN-OLD',
        fromAccountId: null,
        amount: 5000,
      };
      prisma.transaction.findMany.mockResolvedValue([oldTxn]);
      prisma.transaction.update.mockResolvedValue({});

      await service.expireOldPendingTransactions();

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'txn-old' },
          data: expect.objectContaining({
            status: 'FAILED',
            description: expect.stringContaining('Expire'),
          }),
        }),
      );
    });

    it('should reverse debit for expired withdrawal transactions', async () => {
      const oldWithdrawal = {
        id: 'txn-exp-wd',
        type: 'WITHDRAWAL',
        reference: 'TXN-EXP-WD',
        fromAccountId: 'acc-1',
        amount: 7000,
      };
      prisma.transaction.findMany.mockResolvedValue([oldWithdrawal]);
      prisma.account.update.mockResolvedValue({});
      prisma.transaction.update.mockResolvedValue({});

      await service.expireOldPendingTransactions();

      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: { balance: { increment: 7000 } },
        }),
      );
      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });
});
