import { Test, TestingModule } from '@nestjs/testing';
import { ContributionsService } from './contributions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('ContributionsService', () => {
  let service: ContributionsService;
  let prisma: PrismaService;
  let auditService: AuditService;

  const mockPrisma = {
    savingsProduct: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    savingsAccount: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    savingsContribution: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    cashRegister: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ContributionsService>(ContributionsService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== PRODUITS D'EPARGNE ====================

  describe('createProduct', () => {
    const dto = {
      name: 'Epargne Libre',
      interestRate: 3.5,
      minDeposit: 500,
      minBalance: 0,
    };

    it('should create a savings product', async () => {
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(null);
      mockPrisma.savingsProduct.create.mockResolvedValue({ id: 'prod-1', ...dto });

      const result = await service.createProduct(dto as any);

      expect(result).toEqual({ id: 'prod-1', ...dto });
      expect(mockPrisma.savingsProduct.findUnique).toHaveBeenCalledWith({
        where: { name: dto.name },
      });
      expect(mockPrisma.savingsProduct.create).toHaveBeenCalledWith({ data: dto });
    });

    it('should throw ConflictException if product name already exists', async () => {
      mockPrisma.savingsProduct.findUnique.mockResolvedValue({ id: 'existing', name: dto.name });

      await expect(service.createProduct(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllProducts', () => {
    it('should return all products ordered by name', async () => {
      const products = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
      mockPrisma.savingsProduct.findMany.mockResolvedValue(products);

      const result = await service.findAllProducts();

      expect(result).toEqual(products);
      expect(mockPrisma.savingsProduct.findMany).toHaveBeenCalledWith({
        include: { _count: { select: { savingsAccounts: true } } },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOneProduct', () => {
    it('should return a product by id', async () => {
      const product = { id: 'prod-1', name: 'Epargne' };
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(product);

      const result = await service.findOneProduct('prod-1');

      expect(result).toEqual(product);
    });

    it('should throw NotFoundException if product not found', async () => {
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(null);

      await expect(service.findOneProduct('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProduct', () => {
    it('should update a product', async () => {
      const product = { id: 'prod-1', name: 'Epargne' };
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(product);
      mockPrisma.savingsProduct.update.mockResolvedValue({ ...product, name: 'Updated' });

      const result = await service.updateProduct('prod-1', { name: 'Updated' } as any);

      expect(result.name).toBe('Updated');
      expect(mockPrisma.savingsProduct.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { name: 'Updated' },
      });
    });

    it('should throw NotFoundException if product does not exist', async () => {
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(null);

      await expect(service.updateProduct('missing', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== COMPTES EPARGNE ====================

  describe('subscribe', () => {
    const dto = {
      clientId: 'client-1',
      productId: 'prod-1',
      agencyId: 'agency-1',
      initialDeposit: 10000,
    };

    const product = {
      id: 'prod-1',
      name: 'Epargne',
      contributionFrequency: 'MONTHLY',
      lockDurationMonths: 6,
      minDeposit: 500,
    };

    it('should create a savings account with initial deposit', async () => {
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(product);
      const account = {
        id: 'acc-1',
        accountNumber: 'EPG-1234567890',
        product,
        client: { id: 'client-1' },
      };
      mockPrisma.savingsAccount.create.mockResolvedValue(account);
      mockPrisma.savingsAccount.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});

      const result = await service.subscribe(dto as any);

      expect(result).toEqual(account);
      expect(mockPrisma.savingsAccount.create).toHaveBeenCalled();
      expect(mockPrisma.savingsAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { balance: 10000, totalDeposits: 10000 },
        }),
      );
      expect(mockPrisma.savingsContribution.create).toHaveBeenCalled();
    });

    it('should create account without initial deposit when not provided', async () => {
      const dtoNoDeposit = { ...dto, initialDeposit: undefined };
      const productNoLock = { ...product, lockDurationMonths: 0, contributionFrequency: null };
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(productNoLock);
      const account = { id: 'acc-2', product: productNoLock };
      mockPrisma.savingsAccount.create.mockResolvedValue(account);

      const result = await service.subscribe(dtoNoDeposit as any);

      expect(result).toEqual(account);
      expect(mockPrisma.savingsAccount.update).not.toHaveBeenCalled();
      expect(mockPrisma.savingsContribution.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if initial deposit is below minimum', async () => {
      const dtoLowDeposit = { ...dto, initialDeposit: 100 };
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(product);
      mockPrisma.savingsAccount.create.mockResolvedValue({
        id: 'acc-3',
        product,
        client: {},
      });

      await expect(service.subscribe(dtoLowDeposit as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if product not found', async () => {
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(null);

      await expect(service.subscribe(dto as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllSavingsAccounts', () => {
    it('should return paginated savings accounts', async () => {
      const accounts = [{ id: 'acc-1' }];
      mockPrisma.savingsAccount.findMany.mockResolvedValue(accounts);
      mockPrisma.savingsAccount.count.mockResolvedValue(1);

      const result = await service.findAllSavingsAccounts({ page: 1, limit: 20 });

      expect(result.data).toEqual(accounts);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('should apply filters for clientId, agencyId, productId, status', async () => {
      mockPrisma.savingsAccount.findMany.mockResolvedValue([]);
      mockPrisma.savingsAccount.count.mockResolvedValue(0);

      await service.findAllSavingsAccounts({
        clientId: 'c1',
        agencyId: 'a1',
        productId: 'p1',
        status: 'ACTIVE',
      });

      expect(mockPrisma.savingsAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'c1', agencyId: 'a1', productId: 'p1', status: 'ACTIVE' },
        }),
      );
    });
  });

  describe('findOneSavingsAccount', () => {
    it('should return a savings account with contributions', async () => {
      const account = { id: 'acc-1', product: {}, client: {} };
      mockPrisma.savingsAccount.findUnique.mockResolvedValue(account);

      const result = await service.findOneSavingsAccount('acc-1');

      expect(result).toEqual(account);
    });

    it('should throw NotFoundException if account not found', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue(null);

      await expect(service.findOneSavingsAccount('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== DEPOT ====================

  describe('deposit', () => {
    const dto = { savingsAccountId: 'acc-1', amount: 5000 };

    const account = {
      id: 'acc-1',
      status: 'ACTIVE',
      balance: 10000,
      totalDeposits: 10000,
      product: {
        minDeposit: 500,
        contributionFrequency: 'MONTHLY',
      },
    };

    it('should make a deposit and update balance', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue(account);
      mockPrisma.savingsAccount.update.mockResolvedValue({});
      const contribution = { id: 'contrib-1', type: 'DEPOSIT', amount: 5000, balanceAfter: 15000 };
      mockPrisma.savingsContribution.create.mockResolvedValue(contribution);

      const result = await service.deposit(dto as any);

      expect(result).toEqual(contribution);
      expect(mockPrisma.savingsAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { balance: 15000, totalDeposits: 15000 },
        }),
      );
    });

    it('should throw BadRequestException if account is not active', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({ ...account, status: 'CLOSED' });

      await expect(service.deposit(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if amount is below minimum deposit', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue(account);

      await expect(service.deposit({ ...dto, amount: 100 } as any)).rejects.toThrow(BadRequestException);
    });

    it('should update next contribution date when frequency is set', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue(account);
      mockPrisma.savingsAccount.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});

      await service.deposit(dto as any);

      // Should be called twice: once for balance, once for nextContributionDate
      expect(mockPrisma.savingsAccount.update).toHaveBeenCalledTimes(2);
    });

    it('should not update next contribution date when no frequency set', async () => {
      const noFreqAccount = {
        ...account,
        product: { ...account.product, contributionFrequency: null },
      };
      mockPrisma.savingsAccount.findUnique.mockResolvedValue(noFreqAccount);
      mockPrisma.savingsAccount.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({});

      await service.deposit(dto as any);

      // Should be called only once: for balance
      expect(mockPrisma.savingsAccount.update).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== RETRAIT ====================

  describe('withdrawal', () => {
    const dto = { savingsAccountId: 'acc-1', amount: 5000 };

    const account = {
      id: 'acc-1',
      status: 'ACTIVE',
      balance: 20000,
      totalWithdrawals: 0,
      maturityDate: null,
      product: { minBalance: 1000 },
    };

    it('should make a withdrawal and update balance', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue(account);
      mockPrisma.savingsAccount.update.mockResolvedValue({});
      const contribution = { id: 'w-1', type: 'WITHDRAWAL', amount: 5000, balanceAfter: 15000 };
      mockPrisma.savingsContribution.create.mockResolvedValue(contribution);

      const result = await service.withdrawal(dto as any);

      expect(result).toEqual(contribution);
      expect(mockPrisma.savingsAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { balance: 15000, totalWithdrawals: 5000 },
        }),
      );
    });

    it('should throw BadRequestException if account is not active', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({ ...account, status: 'FROZEN' });

      await expect(service.withdrawal(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if savings is locked (maturity date not reached)', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({
        ...account,
        maturityDate: futureDate,
      });

      await expect(service.withdrawal(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if withdrawal would go below min balance', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({
        ...account,
        balance: 5500,
        product: { minBalance: 1000 },
      });

      await expect(
        service.withdrawal({ ...dto, amount: 5000 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if insufficient balance', async () => {
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({
        ...account,
        balance: 3000,
        product: { minBalance: 0 },
      });

      await expect(
        service.withdrawal({ ...dto, amount: 5000 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow withdrawal when maturity date has passed', async () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);
      mockPrisma.savingsAccount.findUnique.mockResolvedValue({
        ...account,
        maturityDate: pastDate,
      });
      mockPrisma.savingsAccount.update.mockResolvedValue({});
      mockPrisma.savingsContribution.create.mockResolvedValue({ id: 'w-2' });

      const result = await service.withdrawal(dto as any);

      expect(result).toEqual({ id: 'w-2' });
    });
  });

  // ==================== HISTORIQUE ====================

  describe('getContributions', () => {
    it('should return paginated contributions', async () => {
      const contributions = [{ id: 'c-1' }];
      mockPrisma.savingsContribution.findMany.mockResolvedValue(contributions);
      mockPrisma.savingsContribution.count.mockResolvedValue(1);

      const result = await service.getContributions('acc-1', { page: 1, limit: 20 });

      expect(result.data).toEqual(contributions);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by type', async () => {
      mockPrisma.savingsContribution.findMany.mockResolvedValue([]);
      mockPrisma.savingsContribution.count.mockResolvedValue(0);

      await service.getContributions('acc-1', { type: 'DEPOSIT' });

      expect(mockPrisma.savingsContribution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'DEPOSIT' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.savingsContribution.findMany.mockResolvedValue([]);
      mockPrisma.savingsContribution.count.mockResolvedValue(0);

      await service.getContributions('acc-1', {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      expect(mockPrisma.savingsContribution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-12-31'),
            },
          }),
        }),
      );
    });
  });

  // ==================== CAISSE ====================

  describe('openCashRegister', () => {
    const dto = { agencyId: 'agency-1', openingBalance: 500000 };
    const userId = 'user-1';

    it('should open a cash register', async () => {
      mockPrisma.cashRegister.findFirst.mockResolvedValue(null);
      const register = { id: 'cr-1', agency: { name: 'Agence 1' }, user: {} };
      mockPrisma.cashRegister.create.mockResolvedValue(register);

      const result = await service.openCashRegister(dto as any, userId);

      expect(result).toEqual(register);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', module: 'TREASURY' }),
      );
    });

    it('should throw ConflictException if user already has an open register', async () => {
      mockPrisma.cashRegister.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.openCashRegister(dto as any, userId)).rejects.toThrow(ConflictException);
    });
  });

  describe('closeCashRegister', () => {
    const dto = { cashRegisterId: 'cr-1', physicalBalance: 750000 };
    const userId = 'user-1';

    const register = {
      id: 'cr-1',
      userId: 'user-1',
      status: 'OPEN',
      openingBalance: 500000,
      totalDeposits: 300000,
      totalWithdrawals: 50000,
    };

    it('should close a cash register and calculate difference', async () => {
      mockPrisma.cashRegister.findUnique.mockResolvedValue(register);
      const closed = { ...register, status: 'CLOSED', agency: {}, user: {} };
      mockPrisma.cashRegister.update.mockResolvedValue(closed);

      const result = await service.closeCashRegister(dto as any, userId);

      expect(result).toEqual(closed);
      expect(mockPrisma.cashRegister.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            closingBalance: 750000, // 500000 + 300000 - 50000
            physicalBalance: 750000,
            difference: 0, // 750000 - 750000
            status: 'CLOSED',
          }),
        }),
      );
    });

    it('should throw NotFoundException if register not found', async () => {
      mockPrisma.cashRegister.findUnique.mockResolvedValue(null);

      await expect(service.closeCashRegister(dto as any, userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if register is already closed', async () => {
      mockPrisma.cashRegister.findUnique.mockResolvedValue({ ...register, status: 'CLOSED' });

      await expect(service.closeCashRegister(dto as any, userId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user is not the owner', async () => {
      mockPrisma.cashRegister.findUnique.mockResolvedValue({ ...register, userId: 'other-user' });

      await expect(service.closeCashRegister(dto as any, userId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCashRegisters', () => {
    it('should return paginated cash registers', async () => {
      const registers = [{ id: 'cr-1' }];
      mockPrisma.cashRegister.findMany.mockResolvedValue(registers);
      mockPrisma.cashRegister.count.mockResolvedValue(1);

      const result = await service.getCashRegisters({ page: 1, limit: 20 });

      expect(result.data).toEqual(registers);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('should apply filters', async () => {
      mockPrisma.cashRegister.findMany.mockResolvedValue([]);
      mockPrisma.cashRegister.count.mockResolvedValue(0);

      await service.getCashRegisters({
        agencyId: 'a1',
        userId: 'u1',
        status: 'OPEN',
      });

      expect(mockPrisma.cashRegister.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agencyId: 'a1', userId: 'u1', status: 'OPEN' },
        }),
      );
    });
  });
});
