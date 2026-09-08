import { Test, TestingModule } from '@nestjs/testing';
import { CreditsService } from './credits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

// ---------- mock factories ----------
const mockPrisma = () => ({
  client: { findUnique: jest.fn() },
  credit: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  creditValidation: { create: jest.fn() },
  account: { update: jest.fn(), findUnique: jest.fn() },
  repayment: {
    createMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  guarantee: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn(),
  },
  creditProduct: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((cb: any) => cb(mockTx())),
});

const mockTx = () => ({
  account: { update: jest.fn() },
  credit: { create: jest.fn(), update: jest.fn() },
  repayment: { createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  guarantee: { createMany: jest.fn() },
});

const mockAccountingService = () => ({
  recordCreditDisbursement: jest.fn().mockResolvedValue(undefined),
  recordCreditRepayment: jest.fn().mockResolvedValue(undefined),
});

const mockAuditService = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

// ---------- stubs ----------
const baseCredit = (overrides: any = {}) => ({
  id: 'crd-1',
  creditNumber: 'CRD-TEST-001',
  clientId: 'client-1',
  amount: new Prisma.Decimal(1000000),
  interestRate: new Prisma.Decimal(12),
  durationMonths: 12,
  monthlyPayment: new Prisma.Decimal(88849),
  totalAmount: new Prisma.Decimal(1066185),
  remainingAmount: new Prisma.Decimal(1066185),
  status: 'SUBMITTED',
  currentValidationLevel: 'AGENT',
  purpose: 'Test',
  createdAt: new Date(),
  ...overrides,
});

describe('CreditsService', () => {
  let service: CreditsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let accounting: ReturnType<typeof mockAccountingService>;
  let audit: ReturnType<typeof mockAuditService>;

  beforeEach(async () => {
    prisma = mockPrisma();
    accounting = mockAccountingService();
    audit = mockAuditService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(CreditsService);
  });

  // ==================== SIMULATE ====================
  describe('simulate', () => {
    it('should simulate CONSTANT repayment correctly', () => {
      const result = service.simulate({
        amount: 1000000,
        interestRate: 12,
        durationMonths: 12,
      });

      expect(result.amount).toBe(1000000);
      expect(result.repaymentType).toBe('CONSTANT');
      expect(result.schedule).toHaveLength(12);
      expect(result.monthlyPayment).toBeGreaterThan(0);
      expect(result.totalInterest).toBeGreaterThan(0);
      expect(result.totalAmount).toBe(result.amount + result.totalInterest);

      // Last row should have remainingBalance 0
      const last = result.schedule[result.schedule.length - 1];
      expect(last.remainingBalance).toBe(0);

      // Each row should have principal + interest = payment
      for (const row of result.schedule) {
        expect(row.principal + row.interest).toBe(row.payment);
      }
    });

    it('should simulate DEGRESSIVE repayment correctly', () => {
      const result = service.simulate({
        amount: 1200000,
        interestRate: 12,
        durationMonths: 12,
        repaymentType: 'DEGRESSIVE',
      });

      expect(result.repaymentType).toBe('DEGRESSIVE');
      expect(result.schedule).toHaveLength(12);

      // In degressive: principal is fixed (except last), payments decrease
      const fixedPrincipal = Math.round(1200000 / 12);
      expect(result.schedule[0].principal).toBe(fixedPrincipal);

      // First payment should be highest
      expect(result.schedule[0].payment).toBeGreaterThanOrEqual(
        result.schedule[result.schedule.length - 1].payment,
      );

      // Last row should have remainingBalance 0
      expect(result.schedule[result.schedule.length - 1].remainingBalance).toBe(0);
    });

    it('should default to CONSTANT when repaymentType is not specified', () => {
      const result = service.simulate({ amount: 500000, interestRate: 10, durationMonths: 6 });
      expect(result.repaymentType).toBe('CONSTANT');
    });
  });

  // ==================== CREATE ====================
  describe('create', () => {
    it('should create a credit request successfully', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: 'client-1', firstName: 'Jean' });
      prisma.credit.create.mockResolvedValue({
        ...baseCredit(),
        client: { firstName: 'Jean' },
        guarantees: [],
      });

      const result = await service.create(
        {
          clientId: 'client-1',
          amount: 1000000,
          interestRate: 12,
          durationMonths: 12,
          purpose: 'Investissement',
        },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(prisma.credit.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException if client not found', async () => {
      prisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          clientId: 'bad-client',
          amount: 1000000,
          interestRate: 12,
          durationMonths: 12,
          purpose: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid guarantee type', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: 'client-1' });

      await expect(
        service.create({
          clientId: 'client-1',
          amount: 1000000,
          interestRate: 12,
          durationMonths: 12,
          purpose: 'Test',
          guarantees: [{ type: 'INVALID_TYPE', description: 'test', value: 100000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid guarantee types', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: 'client-1' });
      prisma.credit.create.mockResolvedValue({ ...baseCredit(), client: {}, guarantees: [{ type: 'REAL_ESTATE' }] });

      const result = await service.create({
        clientId: 'client-1',
        amount: 1000000,
        interestRate: 12,
        durationMonths: 12,
        purpose: 'Test',
        guarantees: [{ type: 'REAL_ESTATE', description: 'Terrain', value: 5000000 }],
      });

      expect(result).toBeDefined();
    });
  });

  // ==================== VALIDATE ====================
  describe('validate', () => {
    it('should reject a credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(baseCredit());

      const result = await service.validate('crd-1', 'user-1', {
        approved: false,
        comment: 'Garanties insuffisantes',
      });

      expect(result.status).toBe('REJECTED');
      expect(prisma.credit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'REJECTED' },
        }),
      );
    });

    it('should approve and move to next level for large credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({ amount: new Prisma.Decimal(5000000), currentValidationLevel: 'AGENT' }),
      );

      const result = await service.validate('crd-1', 'user-1', { approved: true });

      expect(result.status).toBe('UNDER_REVIEW');
      expect(result.nextLevel).toBe('AGENCY_MANAGER');
    });

    it('should fully approve a small credit at AGENT level', async () => {
      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({ amount: new Prisma.Decimal(200000), currentValidationLevel: 'AGENT' }),
      );

      const result = await service.validate('crd-1', 'user-1', { approved: true });

      expect(result.status).toBe('APPROVED');
    });

    it('should throw NotFoundException for unknown credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(null);
      await expect(service.validate('bad-id', 'u-1', { approved: true })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid status', async () => {
      prisma.credit.findUnique.mockResolvedValue(baseCredit({ status: 'DISBURSED' }));
      await expect(service.validate('crd-1', 'u-1', { approved: true })).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== DISBURSE ====================
  describe('disburse', () => {
    it('should disburse an approved credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({
          status: 'APPROVED',
          client: {
            accounts: [{ id: 'acc-1', type: 'CURRENT', status: 'ACTIVE', agencyId: 'ag-1', accountNumber: 'ACC-001' }],
          },
        }),
      );

      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = mockTx();
        return cb(tx);
      });

      const result = await service.disburse('crd-1', 'user-1');
      expect(result.message).toContain('decaisse');
      expect(result.accountCredited).toBe('ACC-001');
    });

    it('should throw NotFoundException for unknown credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(null);
      await expect(service.disburse('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if credit is not approved', async () => {
      prisma.credit.findUnique.mockResolvedValue(baseCredit({ status: 'SUBMITTED', client: { accounts: [] } }));
      await expect(service.disburse('crd-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no active current account', async () => {
      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({
          status: 'APPROVED',
          client: { accounts: [{ type: 'SAVINGS', status: 'ACTIVE' }] },
        }),
      );

      await expect(service.disburse('crd-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== REPAY ====================
  describe('recordRepayment', () => {
    const repaymentStub = (overrides: any = {}) => ({
      id: 'rep-1',
      creditId: 'crd-1',
      amount: new Prisma.Decimal(88849),
      status: 'PENDING',
      dueDate: new Date(Date.now() + 86400000), // tomorrow
      paidAt: null,
      credit: {
        creditNumber: 'CRD-TEST-001',
        amount: new Prisma.Decimal(1000000),
        interestRate: new Prisma.Decimal(12),
        durationMonths: 12,
        client: {
          accounts: [{ agencyId: 'ag-1' }],
        },
      },
      ...overrides,
    });

    it('should record a repayment successfully', async () => {
      prisma.repayment.findUnique.mockResolvedValue(repaymentStub());
      prisma.repayment.count.mockResolvedValue(0); // paidCount for schedule lookup
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = mockTx();
        return cb(tx);
      });

      const result = await service.recordRepayment('rep-1', 88849, 'user-1');
      expect(result.message).toContain('enregistre');
    });

    it('should throw NotFoundException for unknown repayment', async () => {
      prisma.repayment.findUnique.mockResolvedValue(null);
      await expect(service.recordRepayment('bad-id', 50000)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already paid', async () => {
      prisma.repayment.findUnique.mockResolvedValue(repaymentStub({ status: 'PAID' }));
      await expect(service.recordRepayment('rep-1', 50000)).rejects.toThrow(BadRequestException);
    });

    it('should apply penalty when payment is late', async () => {
      const pastDue = new Date(Date.now() - 7 * 86400000); // 7 days ago
      prisma.repayment.findUnique.mockResolvedValue(repaymentStub({ dueDate: pastDue }));
      prisma.repayment.count.mockResolvedValue(0);
      prisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx()));

      const result = await service.recordRepayment('rep-1', 88849, 'user-1');
      expect(result.penalty).toBeGreaterThan(0);
    });
  });

  // ==================== SCORING ====================
  describe('scoreCredit', () => {
    it('should compute scoring with all 7 categories', async () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({
          client: {
            createdAt: twoYearsAgo,
            revenuMensuel: new Prisma.Decimal(500000),
            secteurActivite: 'FONCTIONNAIRE',
            accounts: [
              { type: 'SAVINGS', balance: new Prisma.Decimal(500000) },
            ],
          },
          guarantees: [{ value: new Prisma.Decimal(2000000) }],
        }),
      );

      // Past credits (complete, on time)
      prisma.credit.findMany
        .mockResolvedValueOnce([ // pastCredits
          {
            status: 'COMPLETED',
            repayments: [
              { status: 'PAID', paidAt: new Date('2024-01-15'), dueDate: new Date('2024-01-20') },
            ],
          },
        ])
        .mockResolvedValueOnce([]); // activeCredits for endettement

      prisma.credit.update.mockResolvedValue({});

      const result = await service.scoreCredit('crd-1');
      expect(result.total).toBeGreaterThan(0);
      expect(result.maxScore).toBe(100);
      expect(result.categories).toHaveLength(7);
      expect(result.risk).toBeDefined();
      expect(result.recommendation).toBeDefined();

      // Verify category names
      const categoryNames = result.categories.map(c => c.name);
      expect(categoryNames).toContain('Anciennete client');
      expect(categoryNames).toContain('Historique remboursement');
      expect(categoryNames).toContain('Capacite de remboursement');
      expect(categoryNames).toContain('Garanties');
      expect(categoryNames).toContain('Taux d\'endettement');
      expect(categoryNames).toContain('Secteur d\'activite');
      expect(categoryNames).toContain('Comportement epargne');
    });

    it('should throw NotFoundException for unknown credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(null);
      await expect(service.scoreCredit('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should assign high risk for low score', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // just 10 days

      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({
          amount: new Prisma.Decimal(5000000),
          monthlyPayment: new Prisma.Decimal(450000),
          client: {
            createdAt: recentDate,
            revenuMensuel: new Prisma.Decimal(100000), // very low
            secteurActivite: '',
            accounts: [],
          },
          guarantees: [],
        }),
      );
      prisma.credit.findMany
        .mockResolvedValueOnce([])   // no past credits
        .mockResolvedValueOnce([]);  // no active credits
      prisma.credit.update.mockResolvedValue({});

      const result = await service.scoreCredit('crd-1');
      expect(result.risk).toBe('TRES_ELEVE');
    });
  });

  // ==================== FIND ALL ====================
  describe('findAll', () => {
    it('should return paginated results', async () => {
      prisma.credit.findMany.mockResolvedValue([{ id: 'crd-1' }]);
      prisma.credit.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by status', async () => {
      prisma.credit.findMany.mockResolvedValue([]);
      prisma.credit.count.mockResolvedValue(0);

      await service.findAll({ status: 'APPROVED' });
      expect(prisma.credit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
    });

    it('should filter by clientId', async () => {
      prisma.credit.findMany.mockResolvedValue([]);
      prisma.credit.count.mockResolvedValue(0);

      await service.findAll({ clientId: 'client-1' });
      expect(prisma.credit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientId: 'client-1' }),
        }),
      );
    });
  });

  // ==================== FIND ONE ====================
  describe('findOne', () => {
    it('should return credit by id', async () => {
      prisma.credit.findUnique.mockResolvedValue({ id: 'crd-1', creditNumber: 'CRD-001' });
      const result = await service.findOne('crd-1');
      expect(result.creditNumber).toBe('CRD-001');
    });

    it('should throw NotFoundException', async () => {
      prisma.credit.findUnique.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== PRODUCT CRUD ====================
  describe('Product CRUD', () => {
    it('createProduct should create', async () => {
      prisma.creditProduct.create.mockResolvedValue({ id: 'cp-1', name: 'Credit PME' });
      const result = await service.createProduct({ name: 'Credit PME' } as any);
      expect(result.name).toBe('Credit PME');
    });

    it('findAllProducts should list', async () => {
      prisma.creditProduct.findMany.mockResolvedValue([{ id: 'cp-1' }]);
      const result = await service.findAllProducts();
      expect(result).toHaveLength(1);
    });

    it('findOneProduct should return product', async () => {
      prisma.creditProduct.findUnique.mockResolvedValue({ id: 'cp-1', name: 'Credit PME' });
      const result = await service.findOneProduct('cp-1');
      expect(result.name).toBe('Credit PME');
    });

    it('findOneProduct should throw NotFoundException', async () => {
      prisma.creditProduct.findUnique.mockResolvedValue(null);
      await expect(service.findOneProduct('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('updateProduct should update', async () => {
      prisma.creditProduct.findUnique.mockResolvedValue({ id: 'cp-1' });
      prisma.creditProduct.update.mockResolvedValue({ id: 'cp-1', name: 'Updated' });
      const result = await service.updateProduct('cp-1', { name: 'Updated' } as any);
      expect(result.name).toBe('Updated');
    });
  });

  // ==================== GUARANTEES ====================
  describe('Guarantees', () => {
    it('getGuarantees should return guarantees for credit', async () => {
      prisma.guarantee.findMany.mockResolvedValue([{ id: 'g-1', type: 'REAL_ESTATE' }]);
      const result = await service.getGuarantees('crd-1');
      expect(result).toHaveLength(1);
    });

    it('addGuarantee should create guarantee', async () => {
      prisma.credit.findUnique.mockResolvedValue(baseCredit());
      prisma.guarantee.create.mockResolvedValue({ id: 'g-1', type: 'PLEDGE' });

      const result = await service.addGuarantee(
        'crd-1',
        { type: 'PLEDGE', description: 'Nantissement vehicule', value: 2000000 },
        'user-1',
      );
      expect(result.type).toBe('PLEDGE');
    });

    it('addGuarantee should throw NotFoundException for unknown credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(null);
      await expect(
        service.addGuarantee('bad-id', { type: 'PLEDGE', description: 'test', value: 100 }, 'u-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('updateGuarantee should update', async () => {
      prisma.guarantee.findUnique.mockResolvedValue({ id: 'g-1' });
      prisma.guarantee.update.mockResolvedValue({ id: 'g-1', description: 'Updated' });
      const result = await service.updateGuarantee('g-1', { description: 'Updated' }, 'user-1');
      expect(result.description).toBe('Updated');
    });

    it('updateGuarantee should throw NotFoundException', async () => {
      prisma.guarantee.findUnique.mockResolvedValue(null);
      await expect(service.updateGuarantee('bad-id', {}, 'u-1')).rejects.toThrow(NotFoundException);
    });

    it('releaseGuarantee should set status RELEASED', async () => {
      prisma.guarantee.findUnique.mockResolvedValue({ id: 'g-1' });
      prisma.guarantee.update.mockResolvedValue({ id: 'g-1', status: 'RELEASED' });
      const result = await service.releaseGuarantee('g-1', 'user-1');
      expect(result.status).toBe('RELEASED');
    });

    it('releaseGuarantee should throw NotFoundException', async () => {
      prisma.guarantee.findUnique.mockResolvedValue(null);
      await expect(service.releaseGuarantee('bad-id', 'u-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== WRITE-OFF ====================
  describe('writeOff', () => {
    it('should write off a defaulted credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({
          status: 'DEFAULTED',
          repayments: [
            { status: 'PENDING', amount: new Prisma.Decimal(88849) },
            { status: 'PAID', amount: new Prisma.Decimal(88849) },
          ],
        }),
      );
      prisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx()));

      const result = await service.writeOff('crd-1', 'Irrecouvrable', 'user-1');
      expect(result.message).toContain('radie');
      expect(result.amountWrittenOff).toBe(88849);
    });

    it('should throw for non-active credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(baseCredit({ status: 'COMPLETED', repayments: [] }));
      await expect(service.writeOff('crd-1', 'test', 'u-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== EARLY REPAYMENT ====================
  describe('earlyRepayment', () => {
    it('should throw if credit is not active', async () => {
      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({ status: 'COMPLETED', repayments: [], client: { accounts: [] } }),
      );
      await expect(service.earlyRepayment('crd-1', 500000, false, 'u-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for unknown credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(null);
      await expect(service.earlyRepayment('bad-id', 500000)).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== RESTRUCTURE ====================
  describe('restructureCredit', () => {
    it('should throw for non-disbursed credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(
        baseCredit({ status: 'SUBMITTED', client: { accounts: [] }, guarantees: [], repayments: [] }),
      );
      await expect(
        service.restructureCredit('crd-1', { newAmount: 500000, newInterestRate: 10, newDurationMonths: 18, reason: 'test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for unknown credit', async () => {
      prisma.credit.findUnique.mockResolvedValue(null);
      await expect(
        service.restructureCredit('bad', { newAmount: 500000, newInterestRate: 10, newDurationMonths: 18, reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
