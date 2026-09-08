import { Test, TestingModule } from '@nestjs/testing';
import { ContributionsController } from './contributions.controller';
import { ContributionsService } from './contributions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ContributionsController', () => {
  let controller: ContributionsController;
  let service: ContributionsService;

  const mockService = {
    createProduct: jest.fn(),
    findAllProducts: jest.fn(),
    findOneProduct: jest.fn(),
    updateProduct: jest.fn(),
    subscribe: jest.fn(),
    findAllSavingsAccounts: jest.fn(),
    findOneSavingsAccount: jest.fn(),
    deposit: jest.fn(),
    withdrawal: jest.fn(),
    getContributions: jest.fn(),
    openCashRegister: jest.fn(),
    closeCashRegister: jest.fn(),
    getCashRegisters: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContributionsController],
      providers: [
        { provide: ContributionsService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ContributionsController>(ContributionsController);
    service = module.get<ContributionsService>(ContributionsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== PRODUITS ====================

  describe('createProduct', () => {
    it('should call service.createProduct with dto', async () => {
      const dto = { name: 'Epargne Libre', interestRate: 3.5, minDeposit: 500, minBalance: 0 };
      const expected = { id: 'p1', ...dto };
      mockService.createProduct.mockResolvedValue(expected);

      const result = await controller.createProduct(dto as any);

      expect(result).toEqual(expected);
      expect(mockService.createProduct).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAllProducts', () => {
    it('should call service.findAllProducts', async () => {
      const products = [{ id: 'p1' }];
      mockService.findAllProducts.mockResolvedValue(products);

      const result = await controller.findAllProducts();

      expect(result).toEqual(products);
      expect(mockService.findAllProducts).toHaveBeenCalled();
    });
  });

  describe('findOneProduct', () => {
    it('should call service.findOneProduct with id', async () => {
      const product = { id: 'p1', name: 'Test' };
      mockService.findOneProduct.mockResolvedValue(product);

      const result = await controller.findOneProduct('p1');

      expect(result).toEqual(product);
      expect(mockService.findOneProduct).toHaveBeenCalledWith('p1');
    });
  });

  describe('updateProduct', () => {
    it('should call service.updateProduct with id and dto', async () => {
      const dto = { name: 'Updated' };
      mockService.updateProduct.mockResolvedValue({ id: 'p1', ...dto });

      const result = await controller.updateProduct('p1', dto as any);

      expect(result.name).toBe('Updated');
      expect(mockService.updateProduct).toHaveBeenCalledWith('p1', dto);
    });
  });

  // ==================== COMPTES EPARGNE ====================

  describe('subscribe', () => {
    it('should call service.subscribe with dto', async () => {
      const dto = { clientId: 'c1', productId: 'p1', agencyId: 'a1' };
      mockService.subscribe.mockResolvedValue({ id: 'acc-1' });

      const result = await controller.subscribe(dto as any);

      expect(result).toEqual({ id: 'acc-1' });
      expect(mockService.subscribe).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAllSavingsAccounts', () => {
    it('should call service with parsed query params', async () => {
      mockService.findAllSavingsAccounts.mockResolvedValue({ data: [], meta: {} });

      await controller.findAllSavingsAccounts('c1', 'a1', 'p1', 'ACTIVE', '2', '10');

      expect(mockService.findAllSavingsAccounts).toHaveBeenCalledWith({
        clientId: 'c1',
        agencyId: 'a1',
        productId: 'p1',
        status: 'ACTIVE',
        page: 2,
        limit: 10,
      });
    });

    it('should use default page and limit when not provided', async () => {
      mockService.findAllSavingsAccounts.mockResolvedValue({ data: [], meta: {} });

      await controller.findAllSavingsAccounts(undefined, undefined, undefined, undefined, undefined, undefined);

      expect(mockService.findAllSavingsAccounts).toHaveBeenCalledWith({
        clientId: undefined,
        agencyId: undefined,
        productId: undefined,
        status: undefined,
        page: 1,
        limit: 20,
      });
    });
  });

  describe('findOneSavingsAccount', () => {
    it('should call service.findOneSavingsAccount with id', async () => {
      mockService.findOneSavingsAccount.mockResolvedValue({ id: 'acc-1' });

      const result = await controller.findOneSavingsAccount('acc-1');

      expect(result).toEqual({ id: 'acc-1' });
    });
  });

  // ==================== DEPOT / RETRAIT ====================

  describe('deposit', () => {
    it('should call service.deposit with dto', async () => {
      const dto = { savingsAccountId: 'acc-1', amount: 5000 };
      mockService.deposit.mockResolvedValue({ id: 'contrib-1' });

      const result = await controller.deposit(dto as any);

      expect(result).toEqual({ id: 'contrib-1' });
      expect(mockService.deposit).toHaveBeenCalledWith(dto);
    });
  });

  describe('withdrawal', () => {
    it('should call service.withdrawal with dto', async () => {
      const dto = { savingsAccountId: 'acc-1', amount: 3000 };
      mockService.withdrawal.mockResolvedValue({ id: 'w-1' });

      const result = await controller.withdrawal(dto as any);

      expect(result).toEqual({ id: 'w-1' });
      expect(mockService.withdrawal).toHaveBeenCalledWith(dto);
    });
  });

  // ==================== HISTORIQUE ====================

  describe('getContributions', () => {
    it('should call service.getContributions with parsed params', async () => {
      mockService.getContributions.mockResolvedValue({ data: [], meta: {} });

      await controller.getContributions('acc-1', 'DEPOSIT', '2026-01-01', '2026-12-31', '1', '50');

      expect(mockService.getContributions).toHaveBeenCalledWith('acc-1', {
        type: 'DEPOSIT',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        page: 1,
        limit: 50,
      });
    });
  });

  // ==================== CAISSE ====================

  describe('openCashRegister', () => {
    it('should call service.openCashRegister with dto and userId', async () => {
      const dto = { agencyId: 'a1', openingBalance: 500000 };
      mockService.openCashRegister.mockResolvedValue({ id: 'cr-1' });

      const result = await controller.openCashRegister(dto as any, 'user-1');

      expect(result).toEqual({ id: 'cr-1' });
      expect(mockService.openCashRegister).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('closeCashRegister', () => {
    it('should call service.closeCashRegister with dto and userId', async () => {
      const dto = { cashRegisterId: 'cr-1', physicalBalance: 750000 };
      mockService.closeCashRegister.mockResolvedValue({ id: 'cr-1', status: 'CLOSED' });

      const result = await controller.closeCashRegister(dto as any, 'user-1');

      expect(result.status).toBe('CLOSED');
      expect(mockService.closeCashRegister).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('getCashRegisters', () => {
    it('should call service.getCashRegisters with parsed params', async () => {
      mockService.getCashRegisters.mockResolvedValue({ data: [], meta: {} });

      await controller.getCashRegisters('a1', 'u1', 'OPEN', '1', '10');

      expect(mockService.getCashRegisters).toHaveBeenCalledWith({
        agencyId: 'a1',
        userId: 'u1',
        status: 'OPEN',
        page: 1,
        limit: 10,
      });
    });
  });
});
