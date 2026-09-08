import { Test, TestingModule } from '@nestjs/testing';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';

describe('ClientAuthController', () => {
  let controller: ClientAuthController;

  const mockService = {
    login: jest.fn(),
    logout: jest.fn(),
    getProfile: jest.fn(),
    registerCredentials: jest.fn(),
    changePin: jest.fn(),
    changePassword: jest.fn(),
    getMyAccounts: jest.fn(),
    getMyTransactions: jest.fn(),
    getMyCredits: jest.fn(),
    getMyNotifications: jest.fn(),
    transfer: jest.fn(),
    markNotificationsRead: jest.fn(),
    getMyRepayments: jest.fn(),
    payMyRepayment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientAuthController],
      providers: [{ provide: ClientAuthService, useValue: mockService }],
    }).compile();

    controller = module.get<ClientAuthController>(ClientAuthController);
    jest.clearAllMocks();
  });

  it('devrait etre defini', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('devrait deleguer au service avec le dto', async () => {
      const dto = { identifier: '690000000', password: 'pass123' };
      const expected = { access_token: 'token', client: {} };
      mockService.login.mockResolvedValue(expected);

      const result = await controller.login(dto);

      expect(result).toEqual(expected);
      expect(mockService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('logout', () => {
    it('devrait deleguer au service avec le clientId', async () => {
      const expected = { message: 'Deconnecte' };
      mockService.logout.mockResolvedValue(expected);

      const result = await controller.logout('client-1');

      expect(result).toEqual(expected);
      expect(mockService.logout).toHaveBeenCalledWith('client-1');
    });
  });

  describe('getProfile', () => {
    it('devrait deleguer au service avec le clientId', async () => {
      const expected = { id: 'client-1', firstName: 'Jean' };
      mockService.getProfile.mockResolvedValue(expected);

      const result = await controller.getProfile('client-1');

      expect(result).toEqual(expected);
      expect(mockService.getProfile).toHaveBeenCalledWith('client-1');
    });
  });

  describe('registerCredentials', () => {
    it('devrait deleguer au service avec le clientId et le dto', async () => {
      const dto = { pin: '1234', password: 'newPass' };
      const expected = { message: 'PIN et mot de passe enregistres avec succes' };
      mockService.registerCredentials.mockResolvedValue(expected);

      const result = await controller.registerCredentials('client-1', dto);

      expect(result).toEqual(expected);
      expect(mockService.registerCredentials).toHaveBeenCalledWith('client-1', dto);
    });
  });

  describe('changePin', () => {
    it('devrait deleguer au service avec le clientId et le dto', async () => {
      const dto = { oldPin: '1234', newPin: '5678' };
      const expected = { message: 'PIN modifie avec succes' };
      mockService.changePin.mockResolvedValue(expected);

      const result = await controller.changePin('client-1', dto);

      expect(result).toEqual(expected);
      expect(mockService.changePin).toHaveBeenCalledWith('client-1', dto);
    });
  });

  describe('changePassword', () => {
    it('devrait deleguer au service avec le clientId et le dto', async () => {
      const dto = { oldPassword: 'oldPass', newPassword: 'newPass' };
      const expected = { message: 'Mot de passe modifie.' };
      mockService.changePassword.mockResolvedValue(expected);

      const result = await controller.changePassword('client-1', dto);

      expect(result).toEqual(expected);
      expect(mockService.changePassword).toHaveBeenCalledWith('client-1', dto);
    });
  });

  describe('getMyAccounts', () => {
    it('devrait deleguer au service avec le clientId', async () => {
      const expected = [{ id: 'acc-1', balance: 50000 }];
      mockService.getMyAccounts.mockResolvedValue(expected);

      const result = await controller.getMyAccounts('client-1');

      expect(result).toEqual(expected);
      expect(mockService.getMyAccounts).toHaveBeenCalledWith('client-1');
    });
  });

  describe('getMyTransactions', () => {
    it('devrait deleguer au service avec les parametres parses', async () => {
      const expected = { data: [], total: 0, page: 1, limit: 10 };
      mockService.getMyTransactions.mockResolvedValue(expected);

      const result = await controller.getMyTransactions('client-1', '10', '1', 'acc-1');

      expect(result).toEqual(expected);
      expect(mockService.getMyTransactions).toHaveBeenCalledWith('client-1', {
        limit: 10,
        page: 1,
        accountId: 'acc-1',
      });
    });

    it('devrait passer undefined pour les parametres non fournis', async () => {
      mockService.getMyTransactions.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.getMyTransactions('client-1');

      expect(mockService.getMyTransactions).toHaveBeenCalledWith('client-1', {
        limit: undefined,
        page: undefined,
        accountId: undefined,
      });
    });
  });

  describe('getMyCredits', () => {
    it('devrait deleguer au service avec le clientId', async () => {
      const expected = [{ id: 'credit-1', amount: 500000 }];
      mockService.getMyCredits.mockResolvedValue(expected);

      const result = await controller.getMyCredits('client-1');

      expect(result).toEqual(expected);
      expect(mockService.getMyCredits).toHaveBeenCalledWith('client-1');
    });
  });

  describe('getMyNotifications', () => {
    it('devrait deleguer au service avec le clientId et la limite', async () => {
      const expected = { data: [], unreadCount: 0 };
      mockService.getMyNotifications.mockResolvedValue(expected);

      const result = await controller.getMyNotifications('client-1', '15');

      expect(result).toEqual(expected);
      expect(mockService.getMyNotifications).toHaveBeenCalledWith('client-1', 15);
    });

    it('devrait utiliser 30 comme limite par defaut', async () => {
      mockService.getMyNotifications.mockResolvedValue({ data: [], unreadCount: 0 });

      await controller.getMyNotifications('client-1');

      expect(mockService.getMyNotifications).toHaveBeenCalledWith('client-1', 30);
    });
  });

  describe('transfer', () => {
    it('devrait deleguer au service avec le clientId et le dto', async () => {
      const dto = { fromAccountId: 'acc-1', toAccountNumber: 'ACC002', amount: 10000 };
      const expected = { success: true, reference: 'VIR123' };
      mockService.transfer.mockResolvedValue(expected);

      const result = await controller.transfer('client-1', dto);

      expect(result).toEqual(expected);
      expect(mockService.transfer).toHaveBeenCalledWith('client-1', dto);
    });
  });

  describe('markNotificationsRead', () => {
    it('devrait deleguer au service avec le clientId', async () => {
      const expected = { success: true };
      mockService.markNotificationsRead.mockResolvedValue(expected);

      const result = await controller.markNotificationsRead('client-1');

      expect(result).toEqual(expected);
      expect(mockService.markNotificationsRead).toHaveBeenCalledWith('client-1');
    });
  });

  describe('getMyRepayments', () => {
    it('devrait deleguer au service avec le clientId et creditId', async () => {
      const expected = { credit: {}, repayments: [], summary: {} };
      mockService.getMyRepayments.mockResolvedValue(expected);

      const result = await controller.getMyRepayments('client-1', 'credit-1');

      expect(result).toEqual(expected);
      expect(mockService.getMyRepayments).toHaveBeenCalledWith('client-1', 'credit-1');
    });
  });

  describe('payMyRepayment', () => {
    it('devrait deleguer au service avec les bons parametres', async () => {
      const expected = { message: 'Echeance payee avec succes' };
      mockService.payMyRepayment.mockResolvedValue(expected);

      const result = await controller.payMyRepayment('client-1', 'rep-1', 'acc-1');

      expect(result).toEqual(expected);
      expect(mockService.payMyRepayment).toHaveBeenCalledWith('client-1', 'rep-1', 'acc-1');
    });
  });
});
