import { Test, TestingModule } from '@nestjs/testing';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AccountsController', () => {
  let controller: AccountsController;
  let accountsService: AccountsService;

  const mockAccountsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByClient: jest.fn(),
    getBalance: jest.fn(),
    createAccount: jest.fn(),
    createSavingsAccount: jest.fn(),
    getProducts: jest.fn(),
    createProduct: jest.fn(),
    updateProduct: jest.fn(),
    toggleProduct: jest.fn(),
  };

  const mockPrismaService = {
    rolePermission: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        { provide: AccountsService, useValue: mockAccountsService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<AccountsController>(AccountsController);
    accountsService = module.get<AccountsService>(AccountsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== FIND ALL ====================

  describe('findAll', () => {
    it('should return paginated accounts with default pagination', async () => {
      const expected = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      mockAccountsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(result).toEqual(expected);
      expect(mockAccountsService.findAll).toHaveBeenCalledWith({
        type: undefined,
        status: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('should parse page and limit to integers', async () => {
      mockAccountsService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll('SAVINGS', 'ACTIVE', '3', '15');

      expect(mockAccountsService.findAll).toHaveBeenCalledWith({
        type: 'SAVINGS',
        status: 'ACTIVE',
        page: 3,
        limit: 15,
      });
    });

    it('should default page to 1 and limit to 20 when not provided', async () => {
      mockAccountsService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(undefined, undefined, undefined, undefined);

      expect(mockAccountsService.findAll).toHaveBeenCalledWith({
        type: undefined,
        status: undefined,
        page: 1,
        limit: 20,
      });
    });
  });

  // ==================== GET PRODUCTS ====================

  describe('getProducts', () => {
    it('should return active products by default', async () => {
      const products = [{ id: 'p1', name: 'Epargne' }];
      mockAccountsService.getProducts.mockResolvedValue(products);

      const result = await controller.getProducts();

      expect(result).toEqual(products);
      expect(mockAccountsService.getProducts).toHaveBeenCalledWith(false);
    });

    it('should return all products when all=true', async () => {
      mockAccountsService.getProducts.mockResolvedValue([]);

      await controller.getProducts('true');

      expect(mockAccountsService.getProducts).toHaveBeenCalledWith(true);
    });

    it('should return only active products when all is not "true"', async () => {
      mockAccountsService.getProducts.mockResolvedValue([]);

      await controller.getProducts('false');

      expect(mockAccountsService.getProducts).toHaveBeenCalledWith(false);
    });
  });

  // ==================== CREATE PRODUCT ====================

  describe('createProduct', () => {
    it('should create a product', async () => {
      const body = { code: 'EP', name: 'Epargne', type: 'SAVINGS' };
      mockAccountsService.createProduct.mockResolvedValue({ id: 'p1', ...body });

      const result = await controller.createProduct(body);

      expect(result.id).toBe('p1');
      expect(mockAccountsService.createProduct).toHaveBeenCalledWith(body);
    });
  });

  // ==================== UPDATE PRODUCT ====================

  describe('updateProduct', () => {
    it('should update a product', async () => {
      const body = { name: 'Epargne Premium' };
      mockAccountsService.updateProduct.mockResolvedValue({ id: 'p1', name: 'Epargne Premium' });

      const result = await controller.updateProduct('p1', body);

      expect(result.name).toBe('Epargne Premium');
      expect(mockAccountsService.updateProduct).toHaveBeenCalledWith('p1', body);
    });
  });

  // ==================== DELETE (TOGGLE) PRODUCT ====================

  describe('deleteProduct', () => {
    it('should toggle product active status', async () => {
      mockAccountsService.toggleProduct.mockResolvedValue({ id: 'p1', isActive: false });

      const result = await controller.deleteProduct('p1');

      expect(result.isActive).toBe(false);
      expect(mockAccountsService.toggleProduct).toHaveBeenCalledWith('p1');
    });
  });

  // ==================== FIND BY CLIENT ====================

  describe('findByClient', () => {
    it('should return accounts for a client', async () => {
      const accounts = [{ id: 'a1' }, { id: 'a2' }];
      mockAccountsService.findByClient.mockResolvedValue(accounts);

      const result = await controller.findByClient('client-1');

      expect(result).toEqual(accounts);
      expect(mockAccountsService.findByClient).toHaveBeenCalledWith('client-1');
    });
  });

  // ==================== FIND ONE ====================

  describe('findOne', () => {
    it('should return an account by id', async () => {
      const account = { id: 'a1', accountNumber: '001-EP-000001' };
      mockAccountsService.findOne.mockResolvedValue(account);

      const result = await controller.findOne('a1');

      expect(result).toEqual(account);
      expect(mockAccountsService.findOne).toHaveBeenCalledWith('a1');
    });
  });

  // ==================== GET BALANCE ====================

  describe('getBalance', () => {
    it('should return balance for an account', async () => {
      const balance = { accountNumber: '001-EP-000001', balance: 150000, type: 'SAVINGS', status: 'ACTIVE' };
      mockAccountsService.getBalance.mockResolvedValue(balance);

      const result = await controller.getBalance('a1');

      expect(result).toEqual(balance);
      expect(mockAccountsService.getBalance).toHaveBeenCalledWith('a1');
    });
  });

  // ==================== CREATE ACCOUNT ====================

  describe('createAccount', () => {
    it('should create an account with all parameters', async () => {
      const body = {
        clientId: 'client-1',
        agencyId: 'agency-1',
        productId: 'product-1',
        managerId: 'manager-1',
        initialDeposit: 50000,
        maturityDate: '2027-12-31',
      };
      const expected = {
        account: { id: 'a1' },
        product: { id: 'product-1' },
        openingFees: 5000,
        grossDeposit: 50000,
        netBalance: 45000,
        message: 'Compte ouvert avec succes',
      };
      mockAccountsService.createAccount.mockResolvedValue(expected);

      const result = await controller.createAccount(body);

      expect(result).toEqual(expected);
      expect(mockAccountsService.createAccount).toHaveBeenCalledWith(body);
    });

    it('should create an account without optional parameters', async () => {
      const body = {
        clientId: 'client-1',
        agencyId: 'agency-1',
        productId: 'product-1',
      };
      mockAccountsService.createAccount.mockResolvedValue({ account: { id: 'a1' } });

      const result = await controller.createAccount(body);

      expect(mockAccountsService.createAccount).toHaveBeenCalledWith(body);
    });
  });

  // ==================== CREATE SAVINGS ====================

  describe('createSavings', () => {
    it('should create a savings account', async () => {
      const body = { clientId: 'client-1', agencyId: 'agency-1', interestRate: 5.0 };
      mockAccountsService.createSavingsAccount.mockResolvedValue({
        id: 'a1',
        type: 'SAVINGS',
        interestRate: 5.0,
      });

      const result = await controller.createSavings(body);

      expect(result.type).toBe('SAVINGS');
      expect(mockAccountsService.createSavingsAccount).toHaveBeenCalledWith(
        'client-1',
        'agency-1',
        5.0,
      );
    });
  });
});
