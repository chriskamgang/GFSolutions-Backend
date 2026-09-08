import { Test, TestingModule } from '@nestjs/testing';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { PrismaService } from '../prisma/prisma.service';

const mockService = () => ({
  simulate: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  validate: jest.fn(),
  disburse: jest.fn(),
  recordRepayment: jest.fn(),
  scoreCredit: jest.fn(),
  generateContract: jest.fn(),
  getStats: jest.fn(),
  createProduct: jest.fn(),
  findAllProducts: jest.fn(),
  findOneProduct: jest.fn(),
  updateProduct: jest.fn(),
  getRecoveryDashboard: jest.fn(),
  restructureCredit: jest.fn(),
  earlyRepayment: jest.fn(),
  writeOff: jest.fn(),
  getGuarantees: jest.fn(),
  addGuarantee: jest.fn(),
  updateGuarantee: jest.fn(),
  releaseGuarantee: jest.fn(),
});

describe('CreditsController', () => {
  let controller: CreditsController;
  let service: ReturnType<typeof mockService>;

  beforeEach(async () => {
    service = mockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditsController],
      providers: [
        { provide: CreditsService, useValue: service },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get(CreditsController);
  });

  const user = { sub: 'user-1' };

  // ==================== simulate ====================
  describe('simulate', () => {
    it('should call service.simulate with dto', () => {
      const dto = { amount: 1000000, interestRate: 12, durationMonths: 12 } as any;
      service.simulate.mockReturnValue({ monthlyPayment: 88849, schedule: [] });

      const result = controller.simulate(dto);
      expect(service.simulate).toHaveBeenCalledWith(dto);
      expect(result.monthlyPayment).toBe(88849);
    });
  });

  // ==================== create ====================
  describe('create', () => {
    it('should call service.create with dto and user.sub', async () => {
      const dto = { clientId: 'c-1', amount: 1000000, interestRate: 12, durationMonths: 12, purpose: 'Test' } as any;
      service.create.mockResolvedValue({ id: 'crd-1', status: 'SUBMITTED' });

      const result = await controller.create(dto, user);
      expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.status).toBe('SUBMITTED');
    });
  });

  // ==================== findAll ====================
  describe('findAll', () => {
    it('should pass parsed params to service.findAll', async () => {
      service.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.findAll('2', '10', 'APPROVED', 'client-1');
      expect(service.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        status: 'APPROVED',
        clientId: 'client-1',
      });
    });

    it('should use defaults when no params provided', async () => {
      service.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      await controller.findAll(undefined, undefined, undefined, undefined);
      expect(service.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        clientId: undefined,
      });
    });
  });

  // ==================== findOne ====================
  describe('findOne', () => {
    it('should call service.findOne', async () => {
      service.findOne.mockResolvedValue({ id: 'crd-1' });
      const result = await controller.findOne('crd-1');
      expect(service.findOne).toHaveBeenCalledWith('crd-1');
      expect(result.id).toBe('crd-1');
    });
  });

  // ==================== validate ====================
  describe('validate', () => {
    it('should call service.validate with id, user.sub, dto', async () => {
      const dto = { approved: true } as any;
      service.validate.mockResolvedValue({ status: 'APPROVED' });

      const result = await controller.validate('crd-1', user, dto);
      expect(service.validate).toHaveBeenCalledWith('crd-1', 'user-1', dto);
      expect(result.status).toBe('APPROVED');
    });
  });

  // ==================== disburse ====================
  describe('disburse', () => {
    it('should call service.disburse', async () => {
      service.disburse.mockResolvedValue({ message: 'Credit decaisse' });
      const result = await controller.disburse('crd-1', user);
      expect(service.disburse).toHaveBeenCalledWith('crd-1', 'user-1');
      expect(result.message).toContain('decaisse');
    });
  });

  // ==================== recordRepayment ====================
  describe('recordRepayment', () => {
    it('should call service.recordRepayment', async () => {
      service.recordRepayment.mockResolvedValue({ message: 'Remboursement enregistre', penalty: 0 });
      const result = await controller.recordRepayment('rep-1', 88849, user);
      expect(service.recordRepayment).toHaveBeenCalledWith('rep-1', 88849, 'user-1');
      expect(result.penalty).toBe(0);
    });
  });

  // ==================== scoreCredit ====================
  describe('scoreCredit', () => {
    it('should call service.scoreCredit', async () => {
      service.scoreCredit.mockResolvedValue({ total: 72, risk: 'MODERE' });
      const result = await controller.scoreCredit('crd-1');
      expect(service.scoreCredit).toHaveBeenCalledWith('crd-1');
      expect(result.risk).toBe('MODERE');
    });
  });

  // ==================== getContract ====================
  describe('getContract', () => {
    it('should call service.generateContract', async () => {
      service.generateContract.mockResolvedValue({ creditNumber: 'CRD-001', amount: 1000000 });
      const result = await controller.getContract('crd-1');
      expect(service.generateContract).toHaveBeenCalledWith('crd-1');
      expect(result.creditNumber).toBe('CRD-001');
    });
  });

  // ==================== getStats ====================
  describe('getStats', () => {
    it('should call service.getStats', async () => {
      service.getStats.mockResolvedValue({ total: 50, active: 20, pending: 5 });
      const result = await controller.getStats();
      expect(service.getStats).toHaveBeenCalled();
      expect(result.total).toBe(50);
    });
  });

  // ==================== Product endpoints ====================
  describe('Product endpoints', () => {
    it('createProduct should delegate', async () => {
      const dto = { name: 'Credit PME' } as any;
      service.createProduct.mockResolvedValue({ id: 'cp-1', name: 'Credit PME' });
      const result = await controller.createProduct(dto);
      expect(service.createProduct).toHaveBeenCalledWith(dto);
      expect(result.name).toBe('Credit PME');
    });

    it('findAllProducts should delegate', async () => {
      service.findAllProducts.mockResolvedValue([{ id: 'cp-1' }]);
      const result = await controller.findAllProducts();
      expect(result).toHaveLength(1);
    });

    it('findOneProduct should delegate', async () => {
      service.findOneProduct.mockResolvedValue({ id: 'cp-1' });
      const result = await controller.findOneProduct('cp-1');
      expect(service.findOneProduct).toHaveBeenCalledWith('cp-1');
    });

    it('updateProduct should delegate', async () => {
      const dto = { name: 'Updated' } as any;
      service.updateProduct.mockResolvedValue({ id: 'cp-1', name: 'Updated' });
      const result = await controller.updateProduct('cp-1', dto);
      expect(service.updateProduct).toHaveBeenCalledWith('cp-1', dto);
    });
  });

  // ==================== Recovery ====================
  describe('getRecoveryDashboard', () => {
    it('should call service.getRecoveryDashboard', async () => {
      service.getRecoveryDashboard.mockResolvedValue({ summary: {}, retardSimple: [], preContentieux: [], contentieux: [] });
      const result = await controller.getRecoveryDashboard();
      expect(service.getRecoveryDashboard).toHaveBeenCalled();
      expect(result.summary).toBeDefined();
    });
  });

  // ==================== Restructure ====================
  describe('restructureCredit', () => {
    it('should call service.restructureCredit', async () => {
      const body = { newAmount: 500000, newInterestRate: 10, newDurationMonths: 18, reason: 'Difficulte' };
      service.restructureCredit.mockResolvedValue({ message: 'Credit restructure' });
      const result = await controller.restructureCredit('crd-1', user, body);
      expect(service.restructureCredit).toHaveBeenCalledWith('crd-1', body, 'user-1');
    });
  });

  // ==================== Early repayment ====================
  describe('earlyRepayment', () => {
    it('should call service.earlyRepayment', async () => {
      service.earlyRepayment.mockResolvedValue({ message: 'Remboursement anticipe' });
      const dto = { amount: 500000, isTotal: false } as any;
      const result = await controller.earlyRepayment('crd-1', dto, user);
      expect(service.earlyRepayment).toHaveBeenCalledWith('crd-1', 500000, false, 'user-1');
    });
  });

  // ==================== Write-off ====================
  describe('writeOff', () => {
    it('should call service.writeOff', async () => {
      service.writeOff.mockResolvedValue({ message: 'Credit radie' });
      const result = await controller.writeOff('crd-1', { reason: 'Irrecouvrable' }, user);
      expect(service.writeOff).toHaveBeenCalledWith('crd-1', 'Irrecouvrable', 'user-1');
    });
  });

  // ==================== Guarantees ====================
  describe('Guarantee endpoints', () => {
    it('getGuarantees should delegate', async () => {
      service.getGuarantees.mockResolvedValue([{ id: 'g-1' }]);
      const result = await controller.getGuarantees('crd-1');
      expect(service.getGuarantees).toHaveBeenCalledWith('crd-1');
      expect(result).toHaveLength(1);
    });

    it('addGuarantee should delegate', async () => {
      const dto = { type: 'PLEDGE', description: 'test', value: 100000 };
      service.addGuarantee.mockResolvedValue({ id: 'g-1' });
      const result = await controller.addGuarantee('crd-1', dto, user);
      expect(service.addGuarantee).toHaveBeenCalledWith('crd-1', dto, 'user-1');
    });

    it('updateGuarantee should delegate', async () => {
      const dto = { description: 'updated' };
      service.updateGuarantee.mockResolvedValue({ id: 'g-1' });
      const result = await controller.updateGuarantee('g-1', dto, user);
      expect(service.updateGuarantee).toHaveBeenCalledWith('g-1', dto, 'user-1');
    });

    it('releaseGuarantee should delegate', async () => {
      service.releaseGuarantee.mockResolvedValue({ id: 'g-1', status: 'RELEASED' });
      const result = await controller.releaseGuarantee('g-1', user);
      expect(service.releaseGuarantee).toHaveBeenCalledWith('g-1', 'user-1');
      expect(result.status).toBe('RELEASED');
    });
  });
});
