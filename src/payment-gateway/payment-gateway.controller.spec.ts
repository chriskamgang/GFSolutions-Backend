jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid-v4',
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentGatewayAdminController,
  PaymentGatewayMerchantController,
  PaymentGatewayPublicController,
} from './payment-gateway.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PaymentGateway Controllers', () => {
  let adminController: PaymentGatewayAdminController;
  let merchantController: PaymentGatewayMerchantController;
  let publicController: PaymentGatewayPublicController;

  const mockService = {
    registerMerchant: jest.fn(),
    listMerchants: jest.fn(),
    getMerchantById: jest.fn(),
    updateMerchantStatus: jest.fn(),
    updateMerchant: jest.fn(),
    regenerateApiKeys: jest.fn(),
    listMerchantPayments: jest.fn(),
    getGatewayStats: jest.fn(),
    createPayment: jest.fn(),
    getPaymentStatus: jest.fn(),
    partnerOnboardClient: jest.fn(),
    getPaymentDetails: jest.fn(),
    confirmPayment: jest.fn(),
    getMerchantByApiKey: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        PaymentGatewayAdminController,
        PaymentGatewayMerchantController,
        PaymentGatewayPublicController,
      ],
      providers: [
        { provide: PaymentGatewayService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    adminController = module.get<PaymentGatewayAdminController>(PaymentGatewayAdminController);
    merchantController = module.get<PaymentGatewayMerchantController>(PaymentGatewayMerchantController);
    publicController = module.get<PaymentGatewayPublicController>(PaymentGatewayPublicController);
  });

  it('should define all controllers', () => {
    expect(adminController).toBeDefined();
    expect(merchantController).toBeDefined();
    expect(publicController).toBeDefined();
  });

  // ==================== ADMIN CONTROLLER ====================

  describe('PaymentGatewayAdminController', () => {
    describe('registerMerchant', () => {
      it('should call service.registerMerchant with body and userId', async () => {
        const body = { name: 'Test', email: 'test@test.com', accountId: 'acc-1', agencyId: 'ag-1' };
        const req = { user: { userId: 'admin-1' } };
        const expected = { id: 'm-1', apiKey: 'gfs_key', apiSecret: 'raw-secret' };
        mockService.registerMerchant.mockResolvedValue(expected);

        const result = await adminController.registerMerchant(body, req);
        expect(result).toEqual(expected);
        expect(mockService.registerMerchant).toHaveBeenCalledWith(body, 'admin-1');
      });
    });

    describe('listMerchants', () => {
      it('should call service.listMerchants with query', async () => {
        const query = { status: 'ACTIVE', page: 1, limit: 20 };
        const expected = { data: [], total: 0, page: 1, limit: 20 };
        mockService.listMerchants.mockResolvedValue(expected);

        const result = await adminController.listMerchants(query);
        expect(result).toEqual(expected);
        expect(mockService.listMerchants).toHaveBeenCalledWith(query);
      });
    });

    describe('getMerchant', () => {
      it('should call service.getMerchantById', async () => {
        const expected = { id: 'm-1', name: 'Test' };
        mockService.getMerchantById.mockResolvedValue(expected);

        const result = await adminController.getMerchant('m-1');
        expect(result).toEqual(expected);
        expect(mockService.getMerchantById).toHaveBeenCalledWith('m-1');
      });
    });

    describe('activate', () => {
      it('should call service.updateMerchantStatus with ACTIVE', async () => {
        const expected = { id: 'm-1', status: 'ACTIVE' };
        mockService.updateMerchantStatus.mockResolvedValue(expected);

        const result = await adminController.activate('m-1');
        expect(result).toEqual(expected);
        expect(mockService.updateMerchantStatus).toHaveBeenCalledWith('m-1', 'ACTIVE');
      });
    });

    describe('suspend', () => {
      it('should call service.updateMerchantStatus with SUSPENDED', async () => {
        const expected = { id: 'm-1', status: 'SUSPENDED' };
        mockService.updateMerchantStatus.mockResolvedValue(expected);

        const result = await adminController.suspend('m-1');
        expect(result).toEqual(expected);
        expect(mockService.updateMerchantStatus).toHaveBeenCalledWith('m-1', 'SUSPENDED');
      });
    });

    describe('updateMerchant', () => {
      it('should call service.updateMerchant with id and body', async () => {
        const body = { webhookUrl: 'https://new.com' };
        const expected = { id: 'm-1', webhookUrl: 'https://new.com' };
        mockService.updateMerchant.mockResolvedValue(expected);

        const result = await adminController.updateMerchant('m-1', body);
        expect(result).toEqual(expected);
        expect(mockService.updateMerchant).toHaveBeenCalledWith('m-1', body);
      });
    });

    describe('regenerateKeys', () => {
      it('should call service.regenerateApiKeys', async () => {
        const expected = { apiKey: 'gfs_new', apiSecret: 'new-secret' };
        mockService.regenerateApiKeys.mockResolvedValue(expected);

        const result = await adminController.regenerateKeys('m-1');
        expect(result).toEqual(expected);
        expect(mockService.regenerateApiKeys).toHaveBeenCalledWith('m-1');
      });
    });

    describe('getMerchantPayments', () => {
      it('should call service.listMerchantPayments with merchant id and query', async () => {
        const query = { page: 1, limit: 10 };
        const expected = { data: [], total: 0, page: 1, limit: 10, stats: [] };
        mockService.listMerchantPayments.mockResolvedValue(expected);

        const result = await adminController.getMerchantPayments('m-1', query);
        expect(result).toEqual(expected);
        expect(mockService.listMerchantPayments).toHaveBeenCalledWith('m-1', query);
      });
    });

    describe('getStats', () => {
      it('should call service.getGatewayStats', async () => {
        const expected = {
          totalMerchants: 10,
          activeMerchants: 8,
          totalPayments: 100,
          completedPayments: 75,
          totalVolumeXAF: 5000000,
          totalOnboardedClients: 200,
        };
        mockService.getGatewayStats.mockResolvedValue(expected);

        const result = await adminController.getStats();
        expect(result).toEqual(expected);
      });
    });
  });

  // ==================== MERCHANT CONTROLLER ====================

  describe('PaymentGatewayMerchantController', () => {
    describe('createPayment', () => {
      it('should call service.createPayment with merchant id from request', async () => {
        const body = { amount: 5000, orderId: 'ORD-1' };
        const req = { merchant: { id: 'm-1' } };
        const expected = { paymentRef: 'PAY-ABCD', paymentUrl: 'https://pay.gfsolutions.cm/pay/PAY-ABCD' };
        mockService.createPayment.mockResolvedValue(expected);

        const result = await merchantController.createPayment(body, req);
        expect(result).toEqual(expected);
        expect(mockService.createPayment).toHaveBeenCalledWith('m-1', body);
      });
    });

    describe('listPayments', () => {
      it('should call service.listMerchantPayments with merchant id', async () => {
        const query = { status: 'COMPLETED' };
        const req = { merchant: { id: 'm-1' } };
        const expected = { data: [], total: 0 };
        mockService.listMerchantPayments.mockResolvedValue(expected);

        const result = await merchantController.listPayments(query, req);
        expect(result).toEqual(expected);
        expect(mockService.listMerchantPayments).toHaveBeenCalledWith('m-1', query);
      });
    });

    describe('getStatus', () => {
      it('should call service.getPaymentStatus with paymentRef and merchant id', async () => {
        const req = { merchant: { id: 'm-1' } };
        const expected = { paymentRef: 'PAY-ABCD', status: 'COMPLETED' };
        mockService.getPaymentStatus.mockResolvedValue(expected);

        const result = await merchantController.getStatus('PAY-ABCD', req);
        expect(result).toEqual(expected);
        expect(mockService.getPaymentStatus).toHaveBeenCalledWith('PAY-ABCD', 'm-1');
      });
    });

    describe('onboardClient', () => {
      it('should call service.partnerOnboardClient with merchant id and body', async () => {
        const body = { firstName: 'Jean', lastName: 'Dupont', phone: '+237699000001' };
        const req = { merchant: { id: 'm-1' } };
        const expected = { success: true, clientNumber: 'CLI-001' };
        mockService.partnerOnboardClient.mockResolvedValue(expected);

        const result = await merchantController.onboardClient(body, req);
        expect(result).toEqual(expected);
        expect(mockService.partnerOnboardClient).toHaveBeenCalledWith('m-1', body);
      });
    });
  });

  // ==================== PUBLIC CONTROLLER ====================

  describe('PaymentGatewayPublicController', () => {
    describe('getDetails', () => {
      it('should call service.getPaymentDetails with paymentRef', async () => {
        const expected = { paymentRef: 'PAY-ABCD', amount: 5000, status: 'PENDING' };
        mockService.getPaymentDetails.mockResolvedValue(expected);

        const result = await publicController.getDetails('PAY-ABCD');
        expect(result).toEqual(expected);
        expect(mockService.getPaymentDetails).toHaveBeenCalledWith('PAY-ABCD');
      });
    });

    describe('confirmPayment', () => {
      it('should call service.confirmPayment with paymentRef, clientNumber, pin and ip', async () => {
        const body = { clientNumber: 'CLI-001', pin: '1234' };
        const expected = { success: true, paymentRef: 'PAY-ABCD', amount: 5000 };
        mockService.confirmPayment.mockResolvedValue(expected);

        const result = await publicController.confirmPayment('PAY-ABCD', body, '127.0.0.1');
        expect(result).toEqual(expected);
        expect(mockService.confirmPayment).toHaveBeenCalledWith(
          'PAY-ABCD',
          'CLI-001',
          '1234',
          '127.0.0.1',
        );
      });
    });
  });
});
