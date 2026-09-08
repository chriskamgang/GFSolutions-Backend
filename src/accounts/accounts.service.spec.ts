import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: PrismaService;

  const mockPrisma = {
    account: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    accountProduct: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    agency: {
      findUnique: jest.fn(),
    },
    accountPlan: {
      findFirst: jest.fn(),
    },
    journalEntry: {
      createMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== FIND ALL ====================

  describe('findAll', () => {
    it('should return paginated accounts', async () => {
      const accounts = [{ id: 'a1' }, { id: 'a2' }];
      mockPrisma.account.findMany.mockResolvedValue(accounts);
      mockPrisma.account.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual(accounts);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should apply type and status filters', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.account.count.mockResolvedValue(0);

      await service.findAll({ type: 'SAVINGS', status: 'ACTIVE', page: 1, limit: 10 });

      const callArgs = mockPrisma.account.findMany.mock.calls[0][0];
      expect(callArgs.where.type).toBe('SAVINGS');
      expect(callArgs.where.status).toBe('ACTIVE');
      expect(callArgs.skip).toBe(0);
      expect(callArgs.take).toBe(10);
    });

    it('should use default pagination values', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.account.count.mockResolvedValue(0);

      await service.findAll({});

      const callArgs = mockPrisma.account.findMany.mock.calls[0][0];
      expect(callArgs.skip).toBe(0);
      expect(callArgs.take).toBe(20);
    });

    it('should calculate totalPages correctly', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.account.count.mockResolvedValue(45);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
    });

    it('should include client, agency, and product relations', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.account.count.mockResolvedValue(0);

      await service.findAll({});

      const callArgs = mockPrisma.account.findMany.mock.calls[0][0];
      expect(callArgs.include).toEqual({ client: true, agency: true, product: true });
    });
  });

  // ==================== FIND ONE ====================

  describe('findOne', () => {
    it('should return an account when found', async () => {
      const account = { id: 'a1', accountNumber: '001-EP-000001', balance: 50000 };
      mockPrisma.account.findUnique.mockResolvedValue(account);

      const result = await service.findOne('a1');

      expect(result).toEqual(account);
      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: 'a1' },
        include: { client: true, product: true },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('nonexistent')).rejects.toThrow('Compte non trouve');
    });
  });

  // ==================== FIND BY CLIENT ====================

  describe('findByClient', () => {
    it('should return accounts for a given client', async () => {
      const accounts = [{ id: 'a1' }, { id: 'a2' }];
      mockPrisma.account.findMany.mockResolvedValue(accounts);

      const result = await service.findByClient('client-1');

      expect(result).toEqual(accounts);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: { clientId: 'client-1' },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when client has no accounts', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);

      const result = await service.findByClient('client-no-accounts');

      expect(result).toEqual([]);
    });
  });

  // ==================== GET BALANCE ====================

  describe('getBalance', () => {
    it('should return balance info for an account', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'a1',
        accountNumber: '001-EP-000001',
        balance: 150000,
        type: 'SAVINGS',
        status: 'ACTIVE',
      });

      const result = await service.getBalance('a1');

      expect(result).toEqual({
        accountNumber: '001-EP-000001',
        balance: 150000,
        type: 'SAVINGS',
        status: 'ACTIVE',
      });
    });

    it('should throw NotFoundException for non-existing account', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(service.getBalance('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== CREATE ACCOUNT ====================

  describe('createAccount', () => {
    const baseParams = {
      clientId: 'client-1',
      agencyId: 'agency-1',
      productId: 'product-1',
    };

    const mockProduct = {
      id: 'product-1',
      code: 'EP',
      name: 'Epargne',
      type: 'SAVINGS',
      openingFees: 5000,
      minOpeningDeposit: 10000,
      interestRate: 3.5,
      isActive: true,
    };

    beforeEach(() => {
      mockPrisma.agency.findUnique.mockResolvedValue({ id: 'agency-1', code: '001' });
      mockPrisma.account.count.mockResolvedValue(0);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(null);

      await expect(service.createAccount(baseParams)).rejects.toThrow(NotFoundException);
      await expect(service.createAccount(baseParams)).rejects.toThrow('Produit de compte non trouve');
    });

    it('should throw BadRequestException for duplicate non-DAT account', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'existing',
        accountNumber: '001-EP-000001',
      });

      await expect(service.createAccount(baseParams)).rejects.toThrow(BadRequestException);
      await expect(service.createAccount(baseParams)).rejects.toThrow('possede deja un compte');
    });

    it('should allow multiple DAT accounts for the same client', async () => {
      const datProduct = { ...mockProduct, type: 'DAT', code: 'DAT' };
      mockPrisma.accountProduct.findUnique.mockResolvedValue(datProduct);
      // No findFirst call for DAT
      mockPrisma.account.create.mockResolvedValue({
        id: 'a1',
        accountNumber: '001-DAT-000001',
        balance: 0,
      });
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);

      const result = await service.createAccount(baseParams);

      expect(result.account.id).toBe('a1');
      // findFirst should NOT be called for DAT type
      expect(mockPrisma.account.findFirst).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if initial deposit is less than fees + minimum', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.createAccount({ ...baseParams, initialDeposit: 10000 }), // needs 15000 (5000 fees + 10000 min)
      ).rejects.toThrow(BadRequestException);
    });

    it('should create account without initial deposit', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({
        id: 'a1',
        accountNumber: '001-EP-000001',
        balance: 0,
      });

      const result = await service.createAccount(baseParams);

      expect(result.account.balance).toBe(0);
      expect(result.netBalance).toBe(0);
      expect(result.openingFees).toBe(5000);
      // No journal entries since no deposit
      expect(mockPrisma.journalEntry.createMany).not.toHaveBeenCalled();
    });

    it('should create account with initial deposit and deduct fees', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({
        id: 'a1',
        accountNumber: '001-EP-000001',
        balance: 15000, // 20000 - 5000 fees
      });
      mockPrisma.accountPlan.findFirst
        .mockResolvedValueOnce({ id: 'caisse', code: '101' })   // compteCaisse
        .mockResolvedValueOnce({ id: 'depot', code: '221' })    // compteDepot
        .mockResolvedValueOnce({ id: 'comm', code: '702' });    // compteCommissions
      mockPrisma.journalEntry.createMany.mockResolvedValue({ count: 2 });

      const result = await service.createAccount({
        ...baseParams,
        initialDeposit: 20000,
      });

      expect(result.grossDeposit).toBe(20000);
      expect(result.netBalance).toBe(15000);
      expect(result.openingFees).toBe(5000);
      // Journal entries: deposit + fees
      expect(mockPrisma.journalEntry.createMany).toHaveBeenCalledTimes(2);
    });

    it('should create journal entries for deposit without fees', async () => {
      const noFeesProduct = { ...mockProduct, openingFees: 0 };
      mockPrisma.accountProduct.findUnique.mockResolvedValue(noFeesProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({
        id: 'a1',
        accountNumber: '001-EP-000001',
        balance: 20000,
      });
      mockPrisma.accountPlan.findFirst
        .mockResolvedValueOnce({ id: 'caisse', code: '101' })
        .mockResolvedValueOnce({ id: 'depot', code: '221' })
        .mockResolvedValueOnce(null); // no commission account
      mockPrisma.journalEntry.createMany.mockResolvedValue({ count: 2 });

      const result = await service.createAccount({
        ...baseParams,
        initialDeposit: 20000,
      });

      expect(result.netBalance).toBe(20000);
      // Only deposit entries, no fees entries
      expect(mockPrisma.journalEntry.createMany).toHaveBeenCalledTimes(1);
    });

    it('should generate account number with agency code and product code', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({
        id: 'a1',
        accountNumber: '001-EP-000001',
        balance: 0,
      });

      await service.createAccount(baseParams);

      const createCall = mockPrisma.account.create.mock.calls[0][0];
      expect(createCall.data.accountNumber).toBe('001-EP-000001');
    });

    it('should increment chrono based on existing accounts', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.count.mockResolvedValue(5); // 5 existing accounts
      mockPrisma.account.create.mockResolvedValue({
        id: 'a1',
        accountNumber: '001-EP-000006',
        balance: 0,
      });

      await service.createAccount(baseParams);

      const createCall = mockPrisma.account.create.mock.calls[0][0];
      expect(createCall.data.accountNumber).toBe('001-EP-000006');
    });

    it('should use default agency code when agency not found', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.agency.findUnique.mockResolvedValue(null); // agency not found
      mockPrisma.account.create.mockResolvedValue({
        id: 'a1',
        accountNumber: '001-EP-000001',
        balance: 0,
      });

      await service.createAccount(baseParams);

      const createCall = mockPrisma.account.create.mock.calls[0][0];
      expect(createCall.data.accountNumber).toBe('001-EP-000001');
    });

    it('should set interestRate and maturityDate when provided', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({ id: 'a1', balance: 0 });

      await service.createAccount({
        ...baseParams,
        maturityDate: '2027-12-31',
      });

      const createCall = mockPrisma.account.create.mock.calls[0][0];
      expect(createCall.data.interestRate).toBe(3.5);
      expect(createCall.data.maturityDate).toEqual(new Date('2027-12-31'));
    });

    it('should return success message with fees info', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({ id: 'a1', balance: 15000 });
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null);

      const result = await service.createAccount({
        ...baseParams,
        initialDeposit: 20000,
      });

      expect(result.message).toContain('ouvert avec succes');
      expect(result.message).toContain("frais d'ouverture");
    });

    it('should return success message without fees info when no fees', async () => {
      const noFeesProduct = { ...mockProduct, openingFees: 0 };
      mockPrisma.accountProduct.findUnique.mockResolvedValue(noFeesProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({ id: 'a1', balance: 0 });

      const result = await service.createAccount(baseParams);

      expect(result.message).toContain('ouvert avec succes');
      expect(result.message).not.toContain("frais d'ouverture");
    });

    it('should silently handle missing account plan entries', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.account.findFirst.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({ id: 'a1', balance: 15000 });
      mockPrisma.accountPlan.findFirst.mockResolvedValue(null); // no plan comptable

      // Should not throw
      const result = await service.createAccount({
        ...baseParams,
        initialDeposit: 20000,
      });

      expect(result.account.id).toBe('a1');
      expect(mockPrisma.journalEntry.createMany).not.toHaveBeenCalled();
    });
  });

  // ==================== CREATE SAVINGS ACCOUNT ====================

  describe('createSavingsAccount', () => {
    it('should create a savings account', async () => {
      const savedAccount = {
        id: 'a1',
        accountNumber: 'SAV-0000000001',
        clientId: 'client-1',
        agencyId: 'agency-1',
        type: 'SAVINGS',
        interestRate: 5.0,
      };
      mockPrisma.account.create.mockResolvedValue(savedAccount);

      const result = await service.createSavingsAccount('client-1', 'agency-1', 5.0);

      expect(result).toEqual(savedAccount);
      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: 'client-1',
          agencyId: 'agency-1',
          type: 'SAVINGS',
          interestRate: 5.0,
        }),
      });
    });

    it('should generate account number with SAV prefix', async () => {
      mockPrisma.account.create.mockResolvedValue({ id: 'a1' });

      await service.createSavingsAccount('c1', 'ag1', 3.0);

      const createCall = mockPrisma.account.create.mock.calls[0][0];
      expect(createCall.data.accountNumber).toMatch(/^SAV-\d{10}$/);
    });
  });

  // ==================== CREATE DAT ACCOUNT ====================

  describe('createDATAccount', () => {
    it('should create a DAT account with maturity date', async () => {
      const maturityDate = new Date('2027-12-31');
      const savedAccount = {
        id: 'a1',
        accountNumber: 'DAT-0000000001',
        clientId: 'client-1',
        agencyId: 'agency-1',
        type: 'DAT',
        interestRate: 8.0,
        maturityDate,
      };
      mockPrisma.account.create.mockResolvedValue(savedAccount);

      const result = await service.createDATAccount('client-1', 'agency-1', 8.0, maturityDate);

      expect(result).toEqual(savedAccount);
      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: 'client-1',
          agencyId: 'agency-1',
          type: 'DAT',
          interestRate: 8.0,
          maturityDate,
        }),
      });
    });

    it('should generate account number with DAT prefix', async () => {
      mockPrisma.account.create.mockResolvedValue({ id: 'a1' });

      await service.createDATAccount('c1', 'ag1', 6.0, new Date('2028-06-30'));

      const createCall = mockPrisma.account.create.mock.calls[0][0];
      expect(createCall.data.accountNumber).toMatch(/^DAT-\d{10}$/);
    });
  });

  // ==================== GET PRODUCTS ====================

  describe('getProducts', () => {
    it('should return only active products by default', async () => {
      const products = [{ id: 'p1', isActive: true }];
      mockPrisma.accountProduct.findMany.mockResolvedValue(products);

      const result = await service.getProducts();

      expect(result).toEqual(products);
      expect(mockPrisma.accountProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });

    it('should return all products when includeInactive is true', async () => {
      mockPrisma.accountProduct.findMany.mockResolvedValue([]);

      await service.getProducts(true);

      expect(mockPrisma.accountProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it('should include account count', async () => {
      mockPrisma.accountProduct.findMany.mockResolvedValue([]);

      await service.getProducts();

      const callArgs = mockPrisma.accountProduct.findMany.mock.calls[0][0];
      expect(callArgs.include).toEqual({ _count: { select: { accounts: true } } });
    });

    it('should order by type ascending', async () => {
      mockPrisma.accountProduct.findMany.mockResolvedValue([]);

      await service.getProducts();

      const callArgs = mockPrisma.accountProduct.findMany.mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ type: 'asc' });
    });
  });

  // ==================== CREATE PRODUCT ====================

  describe('createProduct', () => {
    it('should create a new product', async () => {
      const productData = { code: 'EP', name: 'Epargne', type: 'SAVINGS' };
      mockPrisma.accountProduct.create.mockResolvedValue({ id: 'p1', ...productData });

      const result = await service.createProduct(productData);

      expect(result.id).toBe('p1');
      expect(mockPrisma.accountProduct.create).toHaveBeenCalledWith({ data: productData });
    });
  });

  // ==================== UPDATE PRODUCT ====================

  describe('updateProduct', () => {
    it('should update an existing product', async () => {
      const updateData = { name: 'Epargne Premium' };
      mockPrisma.accountProduct.update.mockResolvedValue({ id: 'p1', name: 'Epargne Premium' });

      const result = await service.updateProduct('p1', updateData);

      expect(result.name).toBe('Epargne Premium');
      expect(mockPrisma.accountProduct.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: updateData,
      });
    });
  });

  // ==================== TOGGLE PRODUCT ====================

  describe('toggleProduct', () => {
    it('should deactivate an active product', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
      mockPrisma.accountProduct.update.mockResolvedValue({ id: 'p1', isActive: false });

      const result = await service.toggleProduct('p1');

      expect(result.isActive).toBe(false);
      expect(mockPrisma.accountProduct.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { isActive: false },
      });
    });

    it('should activate an inactive product', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue({ id: 'p1', isActive: false });
      mockPrisma.accountProduct.update.mockResolvedValue({ id: 'p1', isActive: true });

      const result = await service.toggleProduct('p1');

      expect(result.isActive).toBe(true);
      expect(mockPrisma.accountProduct.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { isActive: true },
      });
    });

    it('should throw NotFoundException for non-existing product', async () => {
      mockPrisma.accountProduct.findUnique.mockResolvedValue(null);

      await expect(service.toggleProduct('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.toggleProduct('nonexistent')).rejects.toThrow('Produit non trouve');
    });
  });
});
