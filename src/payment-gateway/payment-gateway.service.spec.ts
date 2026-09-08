import { Test, TestingModule } from '@nestjs/testing';
import { PaymentGatewayService } from './payment-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SmsService } from '../sms/sms.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');
jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid-v4',
}));

describe('PaymentGatewayService', () => {
  let service: PaymentGatewayService;

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    paymentRequest: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    agency: {
      findUnique: jest.fn(),
    },
    accountProduct: {
      findFirst: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('https://pay.gfsolutions.cm'),
  };

  const mockWhatsappService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };

  const mockSmsService = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentGatewayService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WhatsappService, useValue: mockWhatsappService },
        { provide: SmsService, useValue: mockSmsService },
      ],
    }).compile();

    service = module.get<PaymentGatewayService>(PaymentGatewayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== REGISTER MERCHANT ====================

  describe('registerMerchant', () => {
    const dto = {
      name: 'Test Merchant',
      email: 'merchant@test.com',
      phone: '+237699000001',
      website: 'https://test.com',
      description: 'Test',
      accountId: 'acc-1',
      agencyId: 'ag-1',
    };

    it('should register a merchant successfully', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc-1', status: 'ACTIVE' });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-secret');
      mockPrisma.merchant.create.mockResolvedValue({
        id: 'merchant-1',
        ...dto,
        apiKey: 'gfs_abc123',
        apiSecret: 'hashed-secret',
        status: 'ACTIVE',
      });

      const result = await service.registerMerchant(dto, 'admin-1');

      expect(result.id).toBe('merchant-1');
      expect(result.apiKey).toBeDefined();
      expect(result.apiSecret).toBeDefined(); // raw secret returned once
      expect(result.message).toContain('apiSecret');
      expect(mockPrisma.merchant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: dto.name,
            email: dto.email,
            accountId: dto.accountId,
            status: 'ACTIVE',
            createdById: 'admin-1',
          }),
        }),
      );
    });

    it('should throw BadRequestException if email already exists', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.registerMerchant(dto, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if account not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(service.registerMerchant(dto, 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if account is not active', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc-1', status: 'CLOSED' });

      await expect(service.registerMerchant(dto, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==================== LIST MERCHANTS ====================

  describe('listMerchants', () => {
    it('should return paginated list of merchants with onboarded client count', async () => {
      const merchants = [
        {
          id: 'm-1',
          name: 'Test Merchant',
          account: { accountNumber: 'ACC-001', balance: 100000 },
          agency: { name: 'Agence Akwa' },
          _count: { payments: 5 },
        },
      ];
      mockPrisma.merchant.findMany.mockResolvedValue(merchants);
      mockPrisma.merchant.count.mockResolvedValue(1);
      mockPrisma.client.count.mockResolvedValue(3);

      const result = await service.listMerchants({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].onboardedClients).toBe(3);
      expect(result.total).toBe(1);
    });

    it('should filter by status', async () => {
      mockPrisma.merchant.findMany.mockResolvedValue([]);
      mockPrisma.merchant.count.mockResolvedValue(0);

      await service.listMerchants({ status: 'ACTIVE' });

      expect(mockPrisma.merchant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE' },
        }),
      );
    });
  });

  // ==================== GET MERCHANT BY ID ====================

  describe('getMerchantById', () => {
    it('should return merchant with onboarded client count', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        name: 'Test Merchant',
        account: {},
        agency: {},
        _count: { payments: 10 },
      });
      mockPrisma.client.count.mockResolvedValue(5);

      const result = await service.getMerchantById('m-1');

      expect(result.onboardedClients).toBe(5);
    });

    it('should throw NotFoundException if merchant not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getMerchantById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== UPDATE MERCHANT STATUS ====================

  describe('updateMerchantStatus', () => {
    it('should activate a merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: 'm-1' });
      mockPrisma.merchant.update.mockResolvedValue({ id: 'm-1', status: 'ACTIVE' });

      const result = await service.updateMerchantStatus('m-1', 'ACTIVE');
      expect(result.status).toBe('ACTIVE');
    });

    it('should suspend a merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: 'm-1' });
      mockPrisma.merchant.update.mockResolvedValue({ id: 'm-1', status: 'SUSPENDED' });

      const result = await service.updateMerchantStatus('m-1', 'SUSPENDED');
      expect(result.status).toBe('SUSPENDED');
    });

    it('should throw NotFoundException if merchant not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.updateMerchantStatus('bad-id', 'ACTIVE')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== UPDATE MERCHANT ====================

  describe('updateMerchant', () => {
    it('should update merchant fields', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: 'm-1' });
      mockPrisma.merchant.update.mockResolvedValue({
        id: 'm-1',
        webhookUrl: 'https://new-webhook.com',
      });

      const result = await service.updateMerchant('m-1', { webhookUrl: 'https://new-webhook.com' });
      expect(result.webhookUrl).toBe('https://new-webhook.com');
    });

    it('should throw NotFoundException if merchant not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.updateMerchant('bad-id', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== REGENERATE API KEYS ====================

  describe('regenerateApiKeys', () => {
    it('should generate new API keys', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: 'm-1' });
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-secret');
      mockPrisma.merchant.update.mockResolvedValue({});

      const result = await service.regenerateApiKeys('m-1');

      expect(result.apiKey).toMatch(/^gfs_/);
      expect(result.apiSecret).toBeDefined();
      expect(result.message).toContain('apiSecret');
    });

    it('should throw NotFoundException if merchant not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.regenerateApiKeys('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== GET MERCHANT BY API KEY ====================

  describe('getMerchantByApiKey', () => {
    it('should return merchant when API key is valid and active', async () => {
      const merchant = { id: 'm-1', status: 'ACTIVE', apiKey: 'gfs_key' };
      mockPrisma.merchant.findUnique.mockResolvedValue(merchant);

      const result = await service.getMerchantByApiKey('gfs_key');
      expect(result).toEqual(merchant);
    });

    it('should return null if merchant not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      const result = await service.getMerchantByApiKey('bad-key');
      expect(result).toBeNull();
    });

    it('should return null if merchant is not active', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: 'm-1', status: 'SUSPENDED' });

      const result = await service.getMerchantByApiKey('gfs_key');
      expect(result).toBeNull();
    });
  });

  // ==================== CREATE PAYMENT ====================

  describe('createPayment', () => {
    const dto = {
      amount: 5000,
      orderId: 'ORDER-001',
      description: 'Test payment',
    };

    it('should create a payment link successfully', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        status: 'ACTIVE',
        type: 'PAYMENT',
        webhookUrl: 'https://webhook.com',
        returnUrl: 'https://return.com',
      });
      mockPrisma.paymentRequest.create.mockResolvedValue({
        id: 'pay-1',
        paymentRef: 'PAY-ABCD1234',
        amount: 5000,
        status: 'PENDING',
      });

      const result = await service.createPayment('m-1', dto);

      expect(result.paymentRef).toBeDefined();
      expect(result.paymentUrl).toContain('pay.gfsolutions.cm/pay/');
      expect(result.amount).toBe(5000);
      expect(result.status).toBe('PENDING');
      expect(result.orderId).toBe('ORDER-001');
    });

    it('should throw BadRequestException if amount is below 100', async () => {
      await expect(
        service.createPayment('m-1', { ...dto, amount: 50 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if merchant is inactive', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: 'm-1', status: 'SUSPENDED' });

      await expect(service.createPayment('m-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if merchant type is ONBOARDING', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        status: 'ACTIVE',
        type: 'ONBOARDING',
      });

      await expect(service.createPayment('m-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('should use merchant webhook/return URLs as fallback', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        status: 'ACTIVE',
        type: 'PAYMENT',
        webhookUrl: 'https://merchant-webhook.com',
        returnUrl: 'https://merchant-return.com',
      });
      mockPrisma.paymentRequest.create.mockResolvedValue({
        id: 'pay-1',
        paymentRef: 'PAY-XYZ',
        status: 'PENDING',
      });

      await service.createPayment('m-1', { amount: 1000, orderId: 'ORD-1' });

      expect(mockPrisma.paymentRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callbackUrl: 'https://merchant-webhook.com',
            returnUrl: 'https://merchant-return.com',
          }),
        }),
      );
    });
  });

  // ==================== GET PAYMENT DETAILS ====================

  describe('getPaymentDetails', () => {
    it('should return pending payment details', async () => {
      const payment = {
        paymentRef: 'PAY-ABCD',
        status: 'PENDING',
        amount: 5000,
        currency: 'XAF',
        description: 'Test',
        orderId: 'ORD-1',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        merchant: { name: 'Test Merchant', logoUrl: null, website: null },
      };
      mockPrisma.paymentRequest.findUnique.mockResolvedValue(payment);

      const result = await service.getPaymentDetails('PAY-ABCD');

      expect(result.paymentRef).toBe('PAY-ABCD');
      expect(result.status).toBe('PENDING');
      expect(result.amount).toBe(5000);
    });

    it('should throw NotFoundException if payment not found', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValue(null);

      await expect(service.getPaymentDetails('PAY-INVALID')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if payment has expired', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValue({
        paymentRef: 'PAY-EXPIRED',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 60000), // expired 1 minute ago
        merchant: {},
      });
      mockPrisma.paymentRequest.update.mockResolvedValue({});

      await expect(service.getPaymentDetails('PAY-EXPIRED')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return completed payment without sensitive details', async () => {
      const payment = {
        paymentRef: 'PAY-DONE',
        status: 'COMPLETED',
        amount: 5000,
        currency: 'XAF',
        paidAt: new Date(),
        merchant: { name: 'Test' },
      };
      mockPrisma.paymentRequest.findUnique.mockResolvedValue(payment);

      const result = await service.getPaymentDetails('PAY-DONE');

      expect(result.status).toBe('COMPLETED');
      expect(result).not.toHaveProperty('description');
    });
  });

  // ==================== CONFIRM PAYMENT ====================

  describe('confirmPayment', () => {
    const mockPayment = {
      paymentRef: 'PAY-ABCD',
      status: 'PENDING',
      amount: 5000,
      currency: 'XAF',
      type: 'DEPOT',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      callbackUrl: 'https://webhook.com',
      returnUrl: 'https://return.com',
      merchant: {
        id: 'm-1',
        name: 'Test Merchant',
        accountId: 'merchant-acc',
        agencyId: 'ag-1',
        apiKey: 'gfs_key',
        commissionDepotPct: 1,
        commissionRetraitPct: 2,
      },
    };

    const mockClient = {
      id: 'cl-1',
      clientNumber: 'CLI-001',
      status: 'ACTIVE',
      pin: 'hashed-pin',
      accounts: [{ id: 'client-acc', balance: 100000, status: 'ACTIVE' }],
    };

    beforeEach(() => {
      // Default mocks for the happy path — individual tests override as needed
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn({
        account: { update: jest.fn().mockResolvedValue({}) },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
        paymentRequest: { update: jest.fn().mockResolvedValue({}) },
      }));
    });

    it('should confirm a payment successfully', async () => {
      mockPrisma.paymentRequest.findUnique
        .mockResolvedValueOnce(mockPayment) // confirmPayment lookup
        .mockResolvedValueOnce(null); // sendWebhook lookup (skip)
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);

      const result = await service.confirmPayment('PAY-ABCD', 'CLI-001', '1234', '127.0.0.1');

      expect(result.success).toBe(true);
      expect(result.paymentRef).toBe('PAY-ABCD');
      expect(result.amount).toBe(5000);
      expect(result.merchantName).toBe('Test Merchant');
    });

    it('should throw NotFoundException if payment not found', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.confirmPayment('PAY-BAD', 'CLI-001', '1234'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if payment is not PENDING', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce({
        ...mockPayment,
        status: 'COMPLETED',
      });

      await expect(
        service.confirmPayment('PAY-ABCD', 'CLI-001', '1234'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if payment has expired', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce({
        ...mockPayment,
        expiresAt: new Date(Date.now() - 60000),
      });
      mockPrisma.paymentRequest.update.mockResolvedValue({});

      await expect(
        service.confirmPayment('PAY-ABCD', 'CLI-001', '1234'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if client number is invalid', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce(mockPayment);
      mockPrisma.client.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.confirmPayment('PAY-ABCD', 'CLI-BAD', '1234'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if client is suspended', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce(mockPayment);
      mockPrisma.client.findUnique.mockResolvedValueOnce({
        ...mockClient,
        status: 'SUSPENDED',
      });

      await expect(
        service.confirmPayment('PAY-ABCD', 'CLI-001', '1234'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if PIN not configured', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce(mockPayment);
      mockPrisma.client.findUnique.mockResolvedValueOnce({
        ...mockClient,
        pin: null,
      });

      await expect(
        service.confirmPayment('PAY-ABCD', 'CLI-001', '1234'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if PIN is incorrect', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce(mockPayment);
      mockPrisma.client.findUnique.mockResolvedValueOnce(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.confirmPayment('PAY-ABCD', 'CLI-001', '9999'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if no active account found', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce(mockPayment);
      mockPrisma.client.findUnique.mockResolvedValueOnce({
        ...mockClient,
        accounts: [],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.confirmPayment('PAY-ABCD', 'CLI-001', '1234'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if insufficient balance', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce(mockPayment);
      mockPrisma.client.findUnique.mockResolvedValueOnce({
        ...mockClient,
        accounts: [{ id: 'acc-low', balance: 100, status: 'ACTIVE' }],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.confirmPayment('PAY-ABCD', 'CLI-001', '1234'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== GET PAYMENT STATUS ====================

  describe('getPaymentStatus', () => {
    it('should return payment status for the correct merchant', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValueOnce({
        paymentRef: 'PAY-ABCD',
        merchantId: 'm-1',
        orderId: 'ORD-1',
        amount: 5000,
        currency: 'XAF',
        status: 'COMPLETED',
        paidAt: new Date(),
        transactionId: 'tx-1',
        description: 'Test',
        client: null,
      });

      const result = await service.getPaymentStatus('PAY-ABCD', 'm-1');

      expect(result.paymentRef).toBe('PAY-ABCD');
      expect(result.status).toBe('COMPLETED');
    });

    it('should throw NotFoundException if payment not found', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValue(null);

      await expect(service.getPaymentStatus('PAY-BAD', 'm-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if merchant does not own the payment', async () => {
      mockPrisma.paymentRequest.findUnique.mockResolvedValue({
        paymentRef: 'PAY-ABCD',
        merchantId: 'm-2', // different merchant
      });

      await expect(service.getPaymentStatus('PAY-ABCD', 'm-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ==================== LIST MERCHANT PAYMENTS ====================

  describe('listMerchantPayments', () => {
    it('should return paginated payments with stats', async () => {
      mockPrisma.paymentRequest.findMany.mockResolvedValue([
        { paymentRef: 'PAY-1', amount: 5000, status: 'COMPLETED' },
      ]);
      mockPrisma.paymentRequest.count.mockResolvedValue(1);
      mockPrisma.paymentRequest.groupBy.mockResolvedValue([
        { status: 'COMPLETED', _sum: { amount: 5000 }, _count: { id: 1 } },
      ]);

      const result = await service.listMerchantPayments('m-1', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.stats).toBeDefined();
    });

    it('should filter by status', async () => {
      mockPrisma.paymentRequest.findMany.mockResolvedValue([]);
      mockPrisma.paymentRequest.count.mockResolvedValue(0);
      mockPrisma.paymentRequest.groupBy.mockResolvedValue([]);

      await service.listMerchantPayments('m-1', { status: 'PENDING' });

      expect(mockPrisma.paymentRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: 'm-1',
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  // ==================== PARTNER ONBOARD CLIENT ====================

  describe('partnerOnboardClient', () => {
    const onboardDto = {
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '699000001',
      email: 'jean@test.com',
    };

    it('should onboard a new client successfully', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        name: 'Partner',
        status: 'ACTIVE',
        type: 'ONBOARDING',
        agencyId: 'ag-1',
        webhookUrl: null,
        apiKey: 'gfs_key',
      });
      mockPrisma.client.findFirst.mockResolvedValue(null); // no existing client
      mockPrisma.accountProduct.findFirst.mockResolvedValue({
        id: 'prod-1',
        code: 'CC',
        type: 'CURRENT',
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockPrisma.agency.findUnique.mockResolvedValue({ code: '001' });
      mockPrisma.account.count.mockResolvedValue(0);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn({
        client: {
          create: jest.fn().mockResolvedValue({ id: 'new-cl' }),
        },
        account: {
          create: jest.fn().mockResolvedValue({ id: 'new-acc' }),
          count: jest.fn().mockResolvedValue(0),
        },
        agency: {
          findUnique: jest.fn().mockResolvedValue({ code: '001' }),
        },
        accountProduct: {
          findFirst: jest.fn().mockResolvedValue({ code: 'CC' }),
        },
      }));

      const result = await service.partnerOnboardClient('m-1', onboardDto);

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(false);
      expect(result.clientNumber).toBeDefined();
      expect(result.message).toContain('Compte GFSolutions cree');
    });

    it('should return existing client info if phone already registered', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        name: 'Partner',
        status: 'ACTIVE',
        type: 'ONBOARDING',
        agencyId: 'ag-1',
      });
      mockPrisma.client.findFirst.mockResolvedValue({
        clientNumber: 'CLI-EXISTING',
      });

      const result = await service.partnerOnboardClient('m-1', onboardDto);

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
      expect(result.clientNumber).toBe('CLI-EXISTING');
    });

    it('should throw ForbiddenException if merchant is inactive', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        status: 'SUSPENDED',
      });

      await expect(
        service.partnerOnboardClient('m-1', onboardDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if merchant type is PAYMENT only', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        status: 'ACTIVE',
        type: 'PAYMENT',
      });

      await expect(
        service.partnerOnboardClient('m-1', onboardDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should normalize phone number with +237 prefix', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: 'm-1',
        name: 'Partner',
        status: 'ACTIVE',
        type: 'ONBOARDING',
        agencyId: 'ag-1',
      });
      // The service normalizes the phone to +237699000001
      mockPrisma.client.findFirst.mockResolvedValue({
        clientNumber: 'CLI-123',
      });

      const result = await service.partnerOnboardClient('m-1', {
        ...onboardDto,
        phone: '699000001',
      });

      // Should have searched with normalized phone
      expect(mockPrisma.client.findFirst).toHaveBeenCalledWith({
        where: { phone: '+237699000001' },
      });
      expect(result.alreadyExists).toBe(true);
    });
  });

  // ==================== GATEWAY STATS ====================

  describe('getGatewayStats', () => {
    it('should return global gateway statistics', async () => {
      mockPrisma.merchant.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8); // active
      mockPrisma.paymentRequest.count.mockResolvedValue(100);
      mockPrisma.paymentRequest.aggregate.mockResolvedValue({
        _sum: { amount: 5000000 },
        _count: { id: 75 },
      });
      mockPrisma.client.count.mockResolvedValue(200);

      const result = await service.getGatewayStats();

      expect(result.totalMerchants).toBe(10);
      expect(result.activeMerchants).toBe(8);
      expect(result.totalPayments).toBe(100);
      expect(result.completedPayments).toBe(75);
      expect(result.totalVolumeXAF).toBe(5000000);
      expect(result.totalOnboardedClients).toBe(200);
    });
  });

  // ==================== SEND KYC REMINDERS ====================

  describe('sendKycReminders', () => {
    it('should send KYC reminders via WhatsApp', async () => {
      mockPrisma.client.findMany.mockResolvedValue([
        {
          id: 'cl-1',
          clientNumber: 'CLI-001',
          firstName: 'Jean',
          lastName: 'Dupont',
          phone: '+237699000001',
          kycReminderCount: 0,
        },
      ]);
      mockWhatsappService.sendMessage.mockResolvedValue(undefined);
      mockPrisma.client.update.mockResolvedValue({});

      const result = await service.sendKycReminders();

      expect(result.sent).toBe(1);
      expect(result.total).toBe(1);
      expect(mockWhatsappService.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle WhatsApp failures gracefully', async () => {
      mockPrisma.client.findMany.mockResolvedValue([
        {
          id: 'cl-1',
          clientNumber: 'CLI-001',
          firstName: 'Jean',
          lastName: 'Dupont',
          phone: '+237699000001',
          kycReminderCount: 0,
        },
      ]);
      mockWhatsappService.sendMessage.mockRejectedValue(new Error('WhatsApp down'));

      const result = await service.sendKycReminders();

      expect(result.sent).toBe(0);
      expect(result.total).toBe(1);
    });

    it('should return zero when no clients need reminders', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      const result = await service.sendKycReminders();

      expect(result.sent).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});
