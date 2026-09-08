import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AmlService } from '../aml/aml.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

// ---------- helpers ----------
const mockPrisma = () => ({
  user: { findUnique: jest.fn() },
  account: { findUnique: jest.fn(), update: jest.fn() },
  transaction: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  feeConfig: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  cashRegister: { findFirst: jest.fn(), update: jest.fn() },
  accountProduct: { findUnique: jest.fn() },
  mandataire: { findFirst: jest.fn(), findMany: jest.fn() },
  client: { findUnique: jest.fn() },
  $transaction: jest.fn((cb: any) => cb(mockPrismaTransaction())),
});

const mockPrismaTransaction = () => ({
  account: { update: jest.fn() },
  transaction: { create: jest.fn().mockResolvedValue({ id: 'txn-1', reference: 'TXN-123', status: 'COMPLETED', amount: 50000, fees: 500, tax: 96 }), update: jest.fn() },
});

const mockAccountingService = () => ({
  recordDeposit: jest.fn().mockResolvedValue(undefined),
  recordWithdrawal: jest.fn().mockResolvedValue(undefined),
});

const mockAuditService = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const mockSmsService = () => ({
  sendDepositAlert: jest.fn().mockResolvedValue(undefined),
  sendWithdrawalAlert: jest.fn().mockResolvedValue(undefined),
  sendTransferSentAlert: jest.fn().mockResolvedValue(undefined),
  sendTransferReceivedAlert: jest.fn().mockResolvedValue(undefined),
});

const mockNotificationsService = () => ({
  notifyStaff: jest.fn().mockResolvedValue(undefined),
});

const mockAmlService = () => ({
  analyzeTransaction: jest.fn().mockResolvedValue(undefined),
});

// ---------- active account stub ----------
const activeAccount = (overrides: any = {}) => ({
  id: 'acc-1',
  accountNumber: 'ACC-001',
  status: 'ACTIVE',
  balance: new Prisma.Decimal(100000),
  clientId: 'client-1',
  productId: null,
  client: { clientType: 'PHYSIQUE', phone: '690000000' },
  ...overrides,
});

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let accounting: ReturnType<typeof mockAccountingService>;
  let audit: ReturnType<typeof mockAuditService>;
  let sms: ReturnType<typeof mockSmsService>;
  let notifications: ReturnType<typeof mockNotificationsService>;
  let aml: ReturnType<typeof mockAmlService>;

  beforeEach(async () => {
    prisma = mockPrisma();
    accounting = mockAccountingService();
    audit = mockAuditService();
    sms = mockSmsService();
    notifications = mockNotificationsService();
    aml = mockAmlService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('19.25') } },
        { provide: AccountingService, useValue: accounting },
        { provide: AuditService, useValue: audit },
        { provide: SmsService, useValue: sms },
        { provide: NotificationsService, useValue: notifications },
        { provide: AmlService, useValue: aml },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  // ==================== DEPOSIT ====================
  describe('deposit', () => {
    const dto = { toAccountId: 'acc-1', amount: 50000, agencyId: 'ag-1' };

    beforeEach(() => {
      // verifySignataire internals
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount()) // verifySignataire
        .mockResolvedValueOnce({ clientId: 'client-1' }); // AML lookup
      prisma.feeConfig.findFirst.mockResolvedValue(null);
      prisma.cashRegister.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = mockPrismaTransaction();
        return cb(tx);
      });
    });

    it('should successfully deposit', async () => {
      const result = await service.deposit(dto, 'user-1');
      expect(result).toBeDefined();
      expect(result.reference).toBeDefined();
    });

    it('should throw BadRequestException for inactive account', async () => {
      prisma.account.findUnique.mockReset();
      prisma.account.findUnique.mockResolvedValueOnce(activeAccount({ status: 'INACTIVE' }));

      await expect(service.deposit(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cash ceiling exceeded', async () => {
      prisma.cashRegister.findFirst.mockResolvedValue({
        id: 'cr-1',
        userId: 'user-1',
        status: 'OPEN',
        cashCeiling: 80000,
        openingBalance: 50000,
        totalDeposits: 20000,
        totalWithdrawals: 0,
      });

      await expect(service.deposit(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== WITHDRAWAL ====================
  describe('withdrawal', () => {
    const dto = { fromAccountId: 'acc-1', amount: 20000, agencyId: 'ag-1' };

    beforeEach(() => {
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount()) // verifySignataire
        .mockResolvedValueOnce({ clientId: 'client-1' }); // AML lookup
      prisma.feeConfig.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = mockPrismaTransaction();
        return cb(tx);
      });
    });

    it('should successfully withdraw', async () => {
      const result = await service.withdrawal(dto, 'user-1');
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException for insufficient balance', async () => {
      prisma.account.findUnique.mockReset();
      prisma.account.findUnique.mockResolvedValueOnce(
        activeAccount({ balance: new Prisma.Decimal(100) }),
      );
      prisma.feeConfig.findFirst.mockResolvedValue(null);

      await expect(service.withdrawal(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when daily limit exceeded', async () => {
      const product = {
        id: 'prod-1',
        maxWithdrawalPerTransaction: null,
        maxWithdrawalPerDay: new Prisma.Decimal(30000),
      };

      prisma.account.findUnique.mockReset();
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount({ productId: 'prod-1' }))
        .mockResolvedValueOnce({ clientId: 'client-1' });
      prisma.accountProduct.findUnique.mockResolvedValue(product);
      prisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 20000 } });

      await expect(service.withdrawal({ ...dto, amount: 25000 }, 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== TRANSFER ====================
  describe('transfer', () => {
    const dto = { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 10000, agencyId: 'ag-1' };

    beforeEach(() => {
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount()) // verifySignataire (from)
        .mockResolvedValueOnce(activeAccount({ id: 'acc-2' })); // toAccount lookup
      prisma.feeConfig.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = mockPrismaTransaction();
        return cb(tx);
      });
    });

    it('should successfully transfer', async () => {
      const result = await service.transfer(dto, 'user-1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when destination not found', async () => {
      prisma.account.findUnique.mockReset();
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount())
        .mockResolvedValueOnce(null);

      await expect(service.transfer(dto, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when accounts not active', async () => {
      prisma.account.findUnique.mockReset();
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount({ status: 'FROZEN' }))
        .mockResolvedValueOnce(activeAccount({ id: 'acc-2' }));

      await expect(service.transfer(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for insufficient balance', async () => {
      prisma.account.findUnique.mockReset();
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount({ balance: new Prisma.Decimal(50) }))
        .mockResolvedValueOnce(activeAccount({ id: 'acc-2' }));

      await expect(service.transfer(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== EXTERNAL TRANSFER ====================
  describe('createExternalTransfer', () => {
    const dto = {
      fromAccountId: 'acc-1',
      amount: 50000,
      destinationBank: 'Afriland',
      destinationAccountNumber: '10025-00001',
      beneficiaryName: 'Jean Dupont',
      agencyId: 'ag-1',
    };

    beforeEach(() => {
      prisma.account.findUnique.mockResolvedValueOnce(activeAccount());
      prisma.feeConfig.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.transaction.create.mockResolvedValue({
        id: 'txn-ext-1',
        reference: 'TXN-EXT-123',
        status: 'PENDING',
        amount: 50000,
      });
      (prisma as any).user = { ...prisma.user, findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should create external transfer with PENDING status', async () => {
      const result = await service.createExternalTransfer(dto, 'user-1');
      expect(result.status).toBe('PENDING');
      expect(prisma.transaction.create).toHaveBeenCalled();
    });
  });

  describe('approveExternalTransfer', () => {
    const pendingTx = {
      id: 'txn-ext-1',
      status: 'PENDING',
      amount: new Prisma.Decimal(50000),
      fees: new Prisma.Decimal(500),
      tax: new Prisma.Decimal(96),
      fromAccountId: 'acc-1',
      destinationBank: 'Afriland',
      reference: 'TXN-EXT-123',
      agencyId: 'ag-1',
      fromAccount: { client: { firstName: 'Jean' } },
    };

    it('should approve external transfer', async () => {
      prisma.transaction.findUnique.mockResolvedValue(pendingTx);
      prisma.account.findUnique.mockResolvedValue(activeAccount());
      prisma.feeConfig.findFirst.mockResolvedValue(null);

      const updatedTx = { ...pendingTx, status: 'COMPLETED', approvedById: 'approver-1' };
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = { account: { update: jest.fn() }, transaction: { update: jest.fn().mockResolvedValue(updatedTx) } };
        return cb(tx);
      });

      const result = await service.approveExternalTransfer('txn-ext-1', { approved: true }, 'approver-1');
      expect(result.status).toBe('COMPLETED');
    });

    it('should reject external transfer', async () => {
      prisma.transaction.findUnique.mockResolvedValue(pendingTx);
      prisma.transaction.update.mockResolvedValue({ ...pendingTx, status: 'CANCELLED' });

      const result = await service.approveExternalTransfer('txn-ext-1', { approved: false, comment: 'Suspicious' }, 'approver-1');
      expect(result.status).toBe('CANCELLED');
    });

    it('should throw NotFoundException for unknown transaction', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);
      await expect(service.approveExternalTransfer('bad-id', { approved: true }, 'u-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when not PENDING', async () => {
      prisma.transaction.findUnique.mockResolvedValue({ ...pendingTx, status: 'COMPLETED' });
      await expect(service.approveExternalTransfer('txn-ext-1', { approved: true }, 'u-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== calculateFees ====================
  describe('calculateFees (via deposit)', () => {
    // We test calculateFees indirectly through deposit since it's private

    beforeEach(() => {
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount())
        .mockResolvedValueOnce({ clientId: 'client-1' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.cashRegister.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = mockPrismaTransaction();
        return cb(tx);
      });
    });

    it('should use default fees when no config found', async () => {
      prisma.feeConfig.findFirst.mockResolvedValue(null);
      const result = await service.deposit({ toAccountId: 'acc-1', amount: 100000, agencyId: 'ag-1' });
      // Default: 1% = 1000, tax 19.25% of 1000 = 193
      expect(result).toBeDefined();
    });

    it('should use percentage fee from config', async () => {
      prisma.feeConfig.findFirst.mockResolvedValue({
        feeType: 'PERCENTAGE',
        feeValue: new Prisma.Decimal(2),
        minFee: new Prisma.Decimal(0),
        maxFee: new Prisma.Decimal(0),
        taxRate: new Prisma.Decimal(19.25),
        isActive: true,
      });
      const result = await service.deposit({ toAccountId: 'acc-1', amount: 100000, agencyId: 'ag-1' });
      expect(result).toBeDefined();
    });

    it('should use flat fee from config', async () => {
      prisma.feeConfig.findFirst.mockResolvedValue({
        feeType: 'FLAT',
        feeValue: new Prisma.Decimal(500),
        minFee: new Prisma.Decimal(0),
        maxFee: new Prisma.Decimal(0),
        taxRate: new Prisma.Decimal(19.25),
        isActive: true,
      });
      const result = await service.deposit({ toAccountId: 'acc-1', amount: 100000, agencyId: 'ag-1' });
      expect(result).toBeDefined();
    });

    it('should apply minFee when calculated fees are lower', async () => {
      prisma.feeConfig.findFirst.mockResolvedValue({
        feeType: 'PERCENTAGE',
        feeValue: new Prisma.Decimal(0.1),
        minFee: new Prisma.Decimal(500),
        maxFee: new Prisma.Decimal(0),
        taxRate: new Prisma.Decimal(19.25),
        isActive: true,
      });
      const result = await service.deposit({ toAccountId: 'acc-1', amount: 1000, agencyId: 'ag-1' });
      expect(result).toBeDefined();
    });

    it('should apply maxFee when calculated fees exceed it', async () => {
      prisma.feeConfig.findFirst.mockResolvedValue({
        feeType: 'PERCENTAGE',
        feeValue: new Prisma.Decimal(5),
        minFee: new Prisma.Decimal(0),
        maxFee: new Prisma.Decimal(2000),
        taxRate: new Prisma.Decimal(19.25),
        isActive: true,
      });
      const result = await service.deposit({ toAccountId: 'acc-1', amount: 100000, agencyId: 'ag-1' });
      expect(result).toBeDefined();
    });
  });

  // ==================== checkTransactionLimit ====================
  describe('checkTransactionLimit (via deposit)', () => {
    it('should throw ForbiddenException when amount exceeds role limit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: { name: 'CAISSIER', maxTransactionAmount: new Prisma.Decimal(100000) },
      });
      prisma.account.findUnique.mockResolvedValueOnce(activeAccount());
      prisma.feeConfig.findFirst.mockResolvedValue(null);
      prisma.cashRegister.findFirst.mockResolvedValue(null);

      await expect(
        service.deposit({ toAccountId: 'acc-1', amount: 200000, agencyId: 'ag-1' }, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should pass when amount is within role limit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: { name: 'CAISSIER', maxTransactionAmount: new Prisma.Decimal(500000) },
      });
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount())
        .mockResolvedValueOnce({ clientId: 'client-1' });
      prisma.feeConfig.findFirst.mockResolvedValue(null);
      prisma.cashRegister.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaTransaction()));

      const result = await service.deposit({ toAccountId: 'acc-1', amount: 50000, agencyId: 'ag-1' }, 'user-1');
      expect(result).toBeDefined();
    });
  });

  // ==================== verifySignataire ====================
  describe('verifySignataire (via deposit)', () => {
    it('should pass for Personne Physique without signataire', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(activeAccount())
        .mockResolvedValueOnce({ clientId: 'client-1' });
      prisma.feeConfig.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.cashRegister.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaTransaction()));

      const result = await service.deposit({ toAccountId: 'acc-1', amount: 10000, agencyId: 'ag-1' });
      expect(result).toBeDefined();
    });

    it('should require signataire for Personne Morale (SINGLE)', async () => {
      prisma.account.findUnique.mockResolvedValueOnce(
        activeAccount({ client: { clientType: 'MORALE', signatureRule: 'SINGLE' } }),
      );
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.deposit({ toAccountId: 'acc-1', amount: 10000, agencyId: 'ag-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require 2 signataires for Personne Morale (JOINT)', async () => {
      prisma.account.findUnique.mockResolvedValueOnce(
        activeAccount({ client: { clientType: 'MORALE', signatureRule: 'JOINT' } }),
      );
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.deposit({
          toAccountId: 'acc-1',
          amount: 10000,
          agencyId: 'ag-1',
          signataireIds: ['sig-1'], // only 1, should fail
          signataireVerifie: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for unauthorized signataire (SINGLE)', async () => {
      prisma.account.findUnique.mockResolvedValueOnce(
        activeAccount({ client: { clientType: 'MORALE', signatureRule: 'SINGLE' } }),
      );
      prisma.mandataire.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.deposit({
          toAccountId: 'acc-1',
          amount: 10000,
          agencyId: 'ag-1',
          signataireId: 'sig-unknown',
          signataireVerifie: true,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== getSignataires ====================
  describe('getSignataires', () => {
    it('should return empty for Personne Physique', async () => {
      prisma.account.findUnique.mockResolvedValue(activeAccount());
      const result = await service.getSignataires('acc-1');
      expect(result.isMorale).toBe(false);
      expect(result.signataires).toEqual([]);
    });

    it('should return signataires for Personne Morale', async () => {
      prisma.account.findUnique.mockResolvedValue(
        activeAccount({
          client: {
            clientType: 'MORALE',
            signatureRule: 'JOINT',
            raisonSociale: 'SARL Test',
            formeJuridique: 'SARL',
          },
        }),
      );
      prisma.mandataire.findMany.mockResolvedValue([
        {
          id: 'm-1',
          role: 'DG',
          signatureUrl: null,
          clientPhysique: { id: 'c-1', clientNumber: 'CL-001', firstName: 'Paul', lastName: 'Martin', phone: '690', profilePhoto: null, idDocumentType: 'CNI', idDocumentNumber: '123' },
        },
      ]);

      const result = await service.getSignataires('acc-1');
      expect(result.isMorale).toBe(true);
      expect(result.signatureRule).toBe('JOINT');
      expect(result.signataires).toHaveLength(1);
    });

    it('should throw NotFoundException for unknown account', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.getSignataires('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== generateReceipt ====================
  describe('generateReceipt', () => {
    it('should generate receipt for a deposit transaction', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        id: 'txn-1',
        reference: 'TXN-123',
        type: 'DEPOSIT',
        amount: new Prisma.Decimal(50000),
        fees: new Prisma.Decimal(500),
        tax: new Prisma.Decimal(96),
        status: 'COMPLETED',
        createdAt: new Date(),
        description: 'Depot',
        mobileMoneyProvider: null,
        fromAccount: null,
        toAccount: {
          accountNumber: 'ACC-001',
          client: { clientType: 'PHYSIQUE', firstName: 'Jean', lastName: 'Dupont', raisonSociale: null },
        },
      });

      const receipt = await service.generateReceipt('txn-1');
      expect(receipt.receiptNumber).toBe('TXN-123');
      expect(receipt.typeLabel).toBe('Depot');
      expect(receipt.amount).toBe(50000);
      expect(receipt.clientName).toBe('Jean Dupont');
      expect(receipt.institution).toBe('MicroFinance Cameroun EMF');
    });

    it('should throw NotFoundException for unknown transaction', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);
      await expect(service.generateReceipt('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== findAll ====================
  describe('findAll', () => {
    it('should return paginated transactions', async () => {
      prisma.transaction.findMany.mockResolvedValue([{ id: 'txn-1' }]);
      prisma.transaction.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should filter by type', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);

      await service.findAll({ type: 'DEPOSIT' });
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'DEPOSIT' }),
        }),
      );
    });

    it('should filter by accountId using OR', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);

      await service.findAll({ accountId: 'acc-1' });
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ fromAccountId: 'acc-1' }, { toAccountId: 'acc-1' }],
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);

      await service.findAll({ startDate: '2024-01-01', endDate: '2024-12-31' });
      const call = prisma.transaction.findMany.mock.calls[0][0];
      expect(call.where.createdAt.gte).toEqual(new Date('2024-01-01'));
      expect(call.where.createdAt.lte).toEqual(new Date('2024-12-31'));
    });
  });

  // ==================== findOne ====================
  describe('findOne', () => {
    it('should return transaction by id', async () => {
      const tx = { id: 'txn-1', reference: 'TXN-123', fromAccount: null, toAccount: null };
      prisma.transaction.findUnique.mockResolvedValue(tx);

      const result = await service.findOne('txn-1');
      expect(result.id).toBe('txn-1');
    });

    it('should throw NotFoundException', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== FEE CONFIG CRUD ====================
  describe('Fee config CRUD', () => {
    it('createFeeConfig should create a config', async () => {
      const input = { name: 'Depot cash', transactionType: 'DEPOSIT', feeValue: 1.5 };
      prisma.feeConfig.create.mockResolvedValue({ id: 'fc-1', ...input });

      const result = await service.createFeeConfig(input);
      expect(result.name).toBe('Depot cash');
    });

    it('findAllFeeConfigs should list configs', async () => {
      prisma.feeConfig.findMany.mockResolvedValue([{ id: 'fc-1' }]);
      const result = await service.findAllFeeConfigs();
      expect(result).toHaveLength(1);
    });

    it('updateFeeConfig should update', async () => {
      prisma.feeConfig.findUnique.mockResolvedValue({ id: 'fc-1' });
      prisma.feeConfig.update.mockResolvedValue({ id: 'fc-1', feeValue: 2 });

      const result = await service.updateFeeConfig('fc-1', { feeValue: 2 });
      expect(result.feeValue).toBe(2);
    });

    it('updateFeeConfig should throw NotFoundException', async () => {
      prisma.feeConfig.findUnique.mockResolvedValue(null);
      await expect(service.updateFeeConfig('bad-id', { feeValue: 2 })).rejects.toThrow(NotFoundException);
    });
  });
});
