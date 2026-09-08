import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientAuthService } from './client-auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'mock-client-session-token'),
  })),
}));

import * as bcrypt from 'bcrypt';

describe('ClientAuthService', () => {
  let service: ClientAuthService;
  let prisma: PrismaService;

  const mockTx = {
    account: { update: jest.fn() },
    credit: { update: jest.fn() },
    repayment: { update: jest.fn(), count: jest.fn() },
    transaction: { create: jest.fn() },
    notification: { create: jest.fn() },
  };

  const mockPrisma = {
    client: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    account: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    credit: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    repayment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockTx)),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mock-client-jwt'),
  };

  const mockClient = {
    id: 'client-1',
    clientNumber: 'CLI001',
    clientType: 'INDIVIDUAL',
    phone: '690000000',
    email: 'client@test.com',
    firstName: 'Jean',
    lastName: 'Dupont',
    raisonSociale: null,
    profilePhoto: null,
    password: 'hashed-password',
    pin: 'hashed-pin',
    status: 'ACTIVE',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    sessionToken: null,
    agencyId: 'agency-1',
    address: '123 Rue',
    city: 'Douala',
    region: 'Littoral',
    kycVerified: true,
    createdAt: new Date('2025-01-01'),
    agency: { name: 'Agence Douala' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<ClientAuthService>(ClientAuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();

    // Reset loginAttempts
    (service as any).loginAttempts = new Map();
  });

  describe('login', () => {
    const loginDto = { identifier: '690000000', password: 'password123' };

    it('devrait retourner un token JWT pour un login valide avec mot de passe', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true); // password match
      mockPrisma.client.update.mockResolvedValue(mockClient);

      const result = await service.login(loginDto);

      expect(result.access_token).toBe('mock-client-jwt');
      expect(result.client!.phone).toBe('690000000');
      expect(result.client!.clientNumber).toBe('CLI001');
      expect(result.expiresIn).toBe(3600);
    });

    it('devrait retourner un token JWT pour un login valide avec PIN', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(false)  // password no match
        .mockResolvedValueOnce(true);  // pin match
      mockPrisma.client.update.mockResolvedValue(mockClient);

      const result = await service.login(loginDto);

      expect(result.access_token).toBe('mock-client-jwt');
    });

    it('devrait lancer UnauthorizedException si le client n\'existe pas', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Identifiant ou mot de passe incorrect');
    });

    it('devrait lancer ForbiddenException si le compte est suspendu', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({ ...mockClient, status: 'SUSPENDED' });

      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
      await expect(service.login(loginDto)).rejects.toThrow(/suspendu ou bloque/);
    });

    it('devrait lancer BadRequestException si aucun mot de passe ni PIN configure', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({
        ...mockClient,
        password: null,
        pin: null,
      });

      await expect(service.login(loginDto)).rejects.toThrow(BadRequestException);
      await expect(service.login(loginDto)).rejects.toThrow(/pas encore de mot de passe/);
    });

    it('devrait lancer UnauthorizedException si mot de passe et PIN incorrects', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('devrait bloquer le compte apres 5 tentatives echouees', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      for (let i = 0; i < 5; i++) {
        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      }

      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
      await expect(service.login(loginDto)).rejects.toThrow(/Compte temporairement bloque/);
    });

    it('devrait retourner requires2FA si 2FA active et pas de code', async () => {
      const clientWith2FA = {
        ...mockClient,
        twoFactorEnabled: true,
        twoFactorSecret: 'secret',
      };
      mockPrisma.client.findFirst.mockResolvedValue(clientWith2FA);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      const result = await service.login(loginDto);

      expect(result).toEqual({ requires2FA: true, message: 'Code 2FA requis' });
    });

    it('devrait reinitialiser les tentatives apres un login reussi', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);

      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockPrisma.client.update.mockResolvedValue(mockClient);

      const result = await service.login(loginDto);
      expect(result.access_token).toBeDefined();
    });
  });

  describe('validateClientSession', () => {
    it('devrait retourner true pour un session token valide', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        sessionToken: 'valid-token',
        status: 'ACTIVE',
      });

      const result = await service.validateClientSession('client-1', 'valid-token');
      expect(result).toBe(true);
    });

    it('devrait retourner false si le client n\'existe pas', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      const result = await service.validateClientSession('client-1', 'token');
      expect(result).toBe(false);
    });

    it('devrait retourner false si le compte n\'est pas actif', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        sessionToken: 'valid-token',
        status: 'SUSPENDED',
      });

      const result = await service.validateClientSession('client-1', 'valid-token');
      expect(result).toBe(false);
    });

    it('devrait retourner false si le session token ne correspond pas', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        sessionToken: 'different-token',
        status: 'ACTIVE',
      });

      const result = await service.validateClientSession('client-1', 'wrong-token');
      expect(result).toBe(false);
    });
  });

  describe('getProfile', () => {
    it('devrait retourner le profil du client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        ...mockClient,
        accounts: [{ id: 'acc-1', accountNumber: 'ACC001', type: 'SAVINGS', balance: 50000, status: 'ACTIVE', createdAt: new Date() }],
      });

      const result = await service.getProfile('client-1');

      expect(result.id).toBe('client-1');
      expect(result.firstName).toBe('Jean');
      expect(result.lastName).toBe('Dupont');
      expect(result.agency).toBe('Agence Douala');
      expect(result.accounts).toHaveLength(1);
    });

    it('devrait lancer NotFoundException si le client n\'existe pas', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('client-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('registerCredentials', () => {
    it('devrait enregistrer le PIN et le mot de passe', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);
      (bcrypt.hash as jest.Mock)
        .mockResolvedValueOnce('hashed-new-pin')
        .mockResolvedValueOnce('hashed-new-password');
      mockPrisma.client.update.mockResolvedValue(mockClient);

      const result = await service.registerCredentials('client-1', {
        pin: '1234',
        password: 'newPassword',
      });

      expect(result.message).toContain('PIN et mot de passe enregistres');
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { pin: 'hashed-new-pin', password: 'hashed-new-password' },
      });
    });

    it('devrait lancer NotFoundException si le client n\'existe pas', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.registerCredentials('client-x', { pin: '1234', password: 'pass' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changePin', () => {
    it('devrait changer le PIN avec l\'ancien PIN correct', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-pin');
      mockPrisma.client.update.mockResolvedValue(mockClient);

      const result = await service.changePin('client-1', { oldPin: '1234', newPin: '5678' });

      expect(result.message).toContain('PIN modifie');
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { pin: 'new-hashed-pin' },
      });
    });

    it('devrait lancer BadRequestException si le PIN n\'est pas configure', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ ...mockClient, pin: null });

      await expect(
        service.changePin('client-1', { oldPin: '1234', newPin: '5678' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait lancer UnauthorizedException si l\'ancien PIN est incorrect', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePin('client-1', { oldPin: 'wrong', newPin: '5678' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('devrait changer le mot de passe avec l\'ancien mot de passe correct', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-pass');
      mockPrisma.client.update.mockResolvedValue(mockClient);

      const result = await service.changePassword('client-1', {
        oldPassword: 'oldPass',
        newPassword: 'newPass',
      });

      expect(result.message).toContain('Mot de passe modifie');
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { password: 'new-hashed-pass', sessionToken: null },
      });
    });

    it('devrait lancer BadRequestException si le mot de passe n\'est pas configure', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ ...mockClient, password: null });

      await expect(
        service.changePassword('client-1', { oldPassword: 'old', newPassword: 'new' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait lancer UnauthorizedException si l\'ancien mot de passe est incorrect', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('client-1', { oldPassword: 'wrong', newPassword: 'new' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('devrait invalider le session token', async () => {
      mockPrisma.client.update.mockResolvedValue(mockClient);

      const result = await service.logout('client-1');

      expect(result.message).toBe('Deconnecte');
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { sessionToken: null },
      });
    });
  });

  describe('getMyAccounts', () => {
    it('devrait retourner les comptes actifs du client', async () => {
      const accounts = [
        { id: 'acc-1', accountNumber: 'ACC001', balance: 50000, status: 'ACTIVE' },
      ];
      mockPrisma.account.findMany.mockResolvedValue(accounts);

      const result = await service.getMyAccounts('client-1');

      expect(result).toEqual(accounts);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: { clientId: 'client-1', status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getMyTransactions', () => {
    it('devrait retourner les transactions paginées du client', async () => {
      const accounts = [{ id: 'acc-1' }, { id: 'acc-2' }];
      const transactions = [{ id: 'tx-1', amount: 10000 }];
      mockPrisma.account.findMany.mockResolvedValue(accounts);
      mockPrisma.transaction.findMany.mockResolvedValue(transactions);
      mockPrisma.transaction.count.mockResolvedValue(1);

      const result = await service.getMyTransactions('client-1', { limit: 10, page: 1 });

      expect(result.data).toEqual(transactions);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('devrait filtrer par accountId si fourni', async () => {
      mockPrisma.account.findMany.mockResolvedValue([{ id: 'acc-1' }]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      await service.getMyTransactions('client-1', { accountId: 'acc-1' });

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { fromAccountId: 'acc-1' },
              { toAccountId: 'acc-1' },
            ],
          }),
        }),
      );
    });

    it('devrait utiliser les valeurs par defaut pour limit et page', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await service.getMyTransactions('client-1', {});

      expect(result.limit).toBe(20);
      expect(result.page).toBe(1);
    });
  });

  describe('getMyCredits', () => {
    it('devrait retourner les credits du client', async () => {
      const credits = [{ id: 'credit-1', amount: 500000 }];
      mockPrisma.credit.findMany.mockResolvedValue(credits);

      const result = await service.getMyCredits('client-1');

      expect(result).toEqual(credits);
      expect(mockPrisma.credit.findMany).toHaveBeenCalledWith({
        where: { clientId: 'client-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getMyNotifications', () => {
    it('devrait retourner les notifications et le nombre non lues', async () => {
      const notifications = [{ id: 'notif-1', title: 'Test' }];
      mockPrisma.notification.findMany.mockResolvedValue(notifications);
      mockPrisma.notification.count.mockResolvedValue(3);

      const result = await service.getMyNotifications('client-1', 10);

      expect(result.data).toEqual(notifications);
      expect(result.unreadCount).toBe(3);
    });

    it('devrait utiliser la limite par defaut de 30', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.getMyNotifications('client-1');

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 30 }),
      );
    });
  });

  describe('getMyRepayments', () => {
    it('devrait retourner les echeances d\'un credit du client', async () => {
      const credit = {
        id: 'credit-1',
        clientId: 'client-1',
        creditNumber: 'CR001',
        amount: 500000,
        remainingAmount: 250000,
        monthlyPayment: 50000,
        status: 'ACTIVE',
      };
      const repayments = [
        {
          id: 'rep-1',
          dueDate: new Date('2025-06-01'),
          amount: 50000,
          paidAmount: 0,
          penalty: 0,
          moratoireAmount: 0,
          status: 'PENDING',
          paidAt: null,
        },
        {
          id: 'rep-2',
          dueDate: new Date('2025-05-01'),
          amount: 50000,
          paidAmount: 50000,
          penalty: 0,
          moratoireAmount: 0,
          status: 'PAID',
          paidAt: new Date('2025-05-01'),
        },
      ];

      mockPrisma.credit.findFirst.mockResolvedValue(credit);
      mockPrisma.repayment.findMany.mockResolvedValue(repayments);

      const result = await service.getMyRepayments('client-1', 'credit-1');

      expect(result.credit.id).toBe('credit-1');
      expect(result.repayments).toHaveLength(2);
      expect(result.summary.totalEcheances).toBe(2);
      expect(result.summary.echeancesPaid).toBe(1);
      expect(result.summary.echeancesPending).toBe(1);
    });

    it('devrait lancer NotFoundException si le credit n\'appartient pas au client', async () => {
      mockPrisma.credit.findFirst.mockResolvedValue(null);

      await expect(
        service.getMyRepayments('client-1', 'credit-wrong'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('transfer', () => {
    const transferDto = {
      fromAccountId: 'acc-1',
      toAccountNumber: 'ACC002',
      amount: 10000,
      description: 'Test virement',
    };

    it('devrait effectuer un virement avec succes', async () => {
      mockPrisma.account.findFirst
        .mockResolvedValueOnce({ id: 'acc-1', balance: 50000, agencyId: 'agency-1', clientId: 'client-1' })
        .mockResolvedValueOnce({ id: 'acc-2', accountNumber: 'ACC002', status: 'ACTIVE', clientId: 'client-2' });

      mockTx.account.update.mockResolvedValue({});
      mockTx.transaction.create.mockResolvedValue({ reference: 'VIR123ABC' });
      mockTx.notification.create.mockResolvedValue({});

      const result = await service.transfer('client-1', transferDto);

      expect(result.success).toBe(true);
      expect(result.reference).toBe('VIR123ABC');
    });

    it('devrait lancer BadRequestException si le montant est invalide', async () => {
      await expect(
        service.transfer('client-1', { ...transferDto, amount: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.transfer('client-1', { ...transferDto, amount: -100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait lancer NotFoundException si le compte source n\'existe pas', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.transfer('client-1', transferDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('devrait lancer BadRequestException si le solde est insuffisant', async () => {
      mockPrisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        balance: 5000,
        agencyId: 'agency-1',
        clientId: 'client-1',
      });

      await expect(
        service.transfer('client-1', transferDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait lancer NotFoundException si le compte destinataire n\'existe pas', async () => {
      mockPrisma.account.findFirst
        .mockResolvedValueOnce({ id: 'acc-1', balance: 50000, agencyId: 'agency-1', clientId: 'client-1' })
        .mockResolvedValueOnce(null);

      await expect(
        service.transfer('client-1', transferDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('devrait lancer BadRequestException si source et destination sont identiques', async () => {
      mockPrisma.account.findFirst
        .mockResolvedValueOnce({ id: 'acc-1', balance: 50000, agencyId: 'agency-1', clientId: 'client-1' })
        .mockResolvedValueOnce({ id: 'acc-1', accountNumber: 'ACC001', status: 'ACTIVE', clientId: 'client-1' });

      await expect(
        service.transfer('client-1', transferDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markNotificationsRead', () => {
    it('devrait marquer toutes les notifications comme lues', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markNotificationsRead('client-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { targetId: 'client-1', isRead: false },
        data: { isRead: true },
      });
    });
  });

  describe('payMyRepayment', () => {
    it('devrait payer une echeance avec succes', async () => {
      const repayment = {
        id: 'rep-1',
        creditId: 'credit-1',
        amount: 50000,
        paidAmount: 0,
        penalty: 0,
        moratoireAmount: 0,
        status: 'PENDING',
        credit: { clientId: 'client-1' },
      };

      mockPrisma.repayment.findUnique.mockResolvedValue(repayment);
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 100000,
        clientId: 'client-1',
        status: 'ACTIVE',
      });

      const updatedRepayment = { ...repayment, paidAmount: 50000, status: 'PAID' };
      mockTx.account.update.mockResolvedValue({});
      mockTx.credit.update.mockResolvedValue({});
      mockTx.repayment.update.mockResolvedValue(updatedRepayment);
      mockTx.repayment.count.mockResolvedValue(2); // still pending repayments

      const result = await service.payMyRepayment('client-1', 'rep-1', 'acc-1');

      expect(result.message).toContain('Echeance payee');
    });

    it('devrait lancer NotFoundException si l\'echeance n\'appartient pas au client', async () => {
      mockPrisma.repayment.findUnique.mockResolvedValue(null);

      await expect(
        service.payMyRepayment('client-1', 'rep-x', 'acc-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('devrait lancer NotFoundException si le credit n\'est pas au client', async () => {
      mockPrisma.repayment.findUnique.mockResolvedValue({
        id: 'rep-1',
        credit: { clientId: 'other-client' },
        status: 'PENDING',
      });

      await expect(
        service.payMyRepayment('client-1', 'rep-1', 'acc-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('devrait lancer BadRequestException si l\'echeance est deja payee', async () => {
      mockPrisma.repayment.findUnique.mockResolvedValue({
        id: 'rep-1',
        status: 'PAID',
        credit: { clientId: 'client-1' },
      });

      await expect(
        service.payMyRepayment('client-1', 'rep-1', 'acc-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait lancer NotFoundException si le compte n\'existe pas', async () => {
      mockPrisma.repayment.findUnique.mockResolvedValue({
        id: 'rep-1',
        creditId: 'credit-1',
        amount: 50000,
        paidAmount: 0,
        penalty: 0,
        moratoireAmount: 0,
        status: 'PENDING',
        credit: { clientId: 'client-1' },
      });
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.payMyRepayment('client-1', 'rep-1', 'acc-x'),
      ).rejects.toThrow(NotFoundException);
    });

    it('devrait lancer BadRequestException si le solde est insuffisant', async () => {
      mockPrisma.repayment.findUnique.mockResolvedValue({
        id: 'rep-1',
        creditId: 'credit-1',
        amount: 50000,
        paidAmount: 0,
        penalty: 5000,
        moratoireAmount: 0,
        status: 'PENDING',
        credit: { clientId: 'client-1' },
      });
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 10000, // insufficient
        clientId: 'client-1',
        status: 'ACTIVE',
      });

      await expect(
        service.payMyRepayment('client-1', 'rep-1', 'acc-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
