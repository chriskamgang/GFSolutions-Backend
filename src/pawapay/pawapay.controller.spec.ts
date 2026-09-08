// Mock uuid before any import that uses it
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PawaPayController } from './pawapay.controller';
import { PawaPayService } from './pawapay.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------- Mock service ----------
const mockPawaPayService = () => ({
  initiateDeposit: jest.fn(),
  initiatePayout: jest.fn(),
  getMerchantBalance: jest.fn(),
  topUpMerchantBalance: jest.fn(),
  getTopUpStatus: jest.fn(),
  getDepositStatus: jest.fn(),
  getPayoutStatus: jest.fn(),
  getAvailability: jest.fn(),
});

describe('PawaPayController', () => {
  let controller: PawaPayController;
  let service: ReturnType<typeof mockPawaPayService>;

  beforeEach(async () => {
    service = mockPawaPayService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PawaPayController],
      providers: [
        { provide: PawaPayService, useValue: service },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PawaPayController>(PawaPayController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== Deposit ====================

  describe('initiateDeposit', () => {
    const body = {
      accountId: 'acc-1',
      amount: 5000,
      phone: '237699123456',
      provider: 'MTN_MOMO',
      agencyId: 'agency-1',
      description: 'Test depot',
    };
    const req = { user: { userId: 'user-1' } };

    it('should call service.initiateDeposit with body and initiatedBy from JWT', async () => {
      const expected = { success: true, paymentId: 'kpay-1', transactionId: 'txn-1' };
      service.initiateDeposit.mockResolvedValue(expected);

      const result = await controller.initiateDeposit(body, req);

      expect(result).toEqual(expected);
      expect(service.initiateDeposit).toHaveBeenCalledWith({
        ...body,
        initiatedBy: 'user-1',
      });
    });

    it('should handle missing user gracefully', async () => {
      service.initiateDeposit.mockResolvedValue({ success: true });

      await controller.initiateDeposit(body, { user: undefined } as any);

      expect(service.initiateDeposit).toHaveBeenCalledWith({
        ...body,
        initiatedBy: undefined,
      });
    });
  });

  describe('clientDeposit', () => {
    const body = {
      accountId: 'acc-1',
      amount: 10000,
      phone: '237699123456',
      provider: 'ORANGE_MONEY',
      agencyId: 'agency-1',
    };
    const req = { user: { sub: 'client-1' } };

    it('should call service.initiateDeposit with initiatedBy from client JWT (sub)', async () => {
      service.initiateDeposit.mockResolvedValue({ success: true });

      await controller.clientDeposit(body, req);

      expect(service.initiateDeposit).toHaveBeenCalledWith({
        ...body,
        initiatedBy: 'client-1',
      });
    });
  });

  // ==================== Payout ====================

  describe('initiatePayout', () => {
    const body = {
      accountId: 'acc-1',
      amount: 3000,
      phone: '237699123456',
      provider: 'MTN_MOMO',
      agencyId: 'agency-1',
    };

    it('should call service.initiatePayout with body', async () => {
      const expected = { success: true, withdrawalId: 'kpay-wd-1' };
      service.initiatePayout.mockResolvedValue(expected);

      const result = await controller.initiatePayout(body);

      expect(result).toEqual(expected);
      expect(service.initiatePayout).toHaveBeenCalledWith(body);
    });
  });

  describe('clientPayout', () => {
    const body = {
      accountId: 'acc-2',
      amount: 2000,
      phone: '237699000000',
      provider: 'ORANGE_MONEY',
      agencyId: 'agency-1',
    };

    it('should call service.initiatePayout with body', async () => {
      service.initiatePayout.mockResolvedValue({ success: true });

      await controller.clientPayout(body);

      expect(service.initiatePayout).toHaveBeenCalledWith(body);
    });
  });

  // ==================== Merchant Balance ====================

  describe('getMerchantBalance', () => {
    it('should return merchant balance from service', async () => {
      const expected = { configured: true, balance: 250000, currency: 'XAF' };
      service.getMerchantBalance.mockResolvedValue(expected);

      const result = await controller.getMerchantBalance();

      expect(result).toEqual(expected);
      expect(service.getMerchantBalance).toHaveBeenCalledTimes(1);
    });

    it('should return not configured when service reports so', async () => {
      service.getMerchantBalance.mockResolvedValue({ configured: false, message: 'KPay non configure' });

      const result = await controller.getMerchantBalance();

      expect(result.configured).toBe(false);
    });
  });

  // ==================== Top-up ====================

  describe('topUpBalance', () => {
    const body = { amount: 50000, phone: '237699123456', provider: 'MTN_MOMO' };

    it('should call service.topUpMerchantBalance with body', async () => {
      const expected = { success: true, paymentId: 'topup-1', amount: 50000 };
      service.topUpMerchantBalance.mockResolvedValue(expected);

      const result = await controller.topUpBalance(body);

      expect(result).toEqual(expected);
      expect(service.topUpMerchantBalance).toHaveBeenCalledWith(body);
    });
  });

  describe('getTopUpStatus', () => {
    it('should call service.getTopUpStatus with the payment ID', async () => {
      const expected = { id: 'topup-1', status: 'COMPLETED' };
      service.getTopUpStatus.mockResolvedValue(expected);

      const result = await controller.getTopUpStatus('topup-1');

      expect(result).toEqual(expected);
      expect(service.getTopUpStatus).toHaveBeenCalledWith('topup-1');
    });
  });

  // ==================== Status ====================

  describe('getDepositStatus', () => {
    it('should call service.getDepositStatus with the payment ID', async () => {
      const expected = { id: 'dep-1', status: 'COMPLETED', amount: 5000 };
      service.getDepositStatus.mockResolvedValue(expected);

      const result = await controller.getDepositStatus('dep-1');

      expect(result).toEqual(expected);
      expect(service.getDepositStatus).toHaveBeenCalledWith('dep-1');
    });
  });

  describe('getPayoutStatus', () => {
    it('should call service.getPayoutStatus with the withdrawal ID', async () => {
      const expected = { id: 'wd-1', status: 'FAILED', reason: 'Timeout' };
      service.getPayoutStatus.mockResolvedValue(expected);

      const result = await controller.getPayoutStatus('wd-1');

      expect(result).toEqual(expected);
      expect(service.getPayoutStatus).toHaveBeenCalledWith('wd-1');
    });
  });

  // ==================== Availability ====================

  describe('getAvailability', () => {
    const availabilityResponse = {
      configured: true,
      enabledProviders: ['MTN_MOMO_CMR', 'ORANGE_CMR'],
      providers: [
        { code: 'MTN_MOMO_CMR', name: 'MTN MoMo', country: 'CMR', currency: 'XAF' },
        { code: 'ORANGE_CMR', name: 'Orange Money', country: 'CMR', currency: 'XAF' },
      ],
    };

    it('should return availability from service (staff endpoint)', async () => {
      service.getAvailability.mockResolvedValue(availabilityResponse);

      const result = await controller.getAvailability();

      expect(result).toEqual(availabilityResponse);
      expect(result.providers).toHaveLength(2);
    });
  });

  describe('getClientAvailability', () => {
    it('should return availability from service (client endpoint)', async () => {
      const expected = {
        configured: true,
        enabledProviders: ['MTN_MOMO_CMR'],
        providers: [{ code: 'MTN_MOMO_CMR', name: 'MTN MoMo', country: 'CMR', currency: 'XAF' }],
      };
      service.getAvailability.mockResolvedValue(expected);

      const result = await controller.getClientAvailability();

      expect(result).toEqual(expected);
      expect(service.getAvailability).toHaveBeenCalledTimes(1);
    });
  });
});
