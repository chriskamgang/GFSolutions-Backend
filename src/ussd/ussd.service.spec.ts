import { Test, TestingModule } from '@nestjs/testing';
import { UssdService } from './ussd.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UssdService', () => {
  let service: UssdService;
  let prisma: PrismaService;
  let smsService: SmsService;
  let auditService: AuditService;

  const mockPrisma = {
    client: {
      findFirst: jest.fn(),
    },
    account: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
    },
    tontineMember: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    tontineRound: {
      findFirst: jest.fn(),
    },
    tontinePayment: {
      updateMany: jest.fn(),
    },
    credit: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    repayment: {
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockSmsService = {
    send: jest.fn().mockResolvedValue(true),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UssdService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SmsService, useValue: mockSmsService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<UssdService>(UssdService);
    prisma = module.get<PrismaService>(PrismaService);
    smsService = module.get<SmsService>(SmsService);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // MENU PRINCIPAL
  // ==========================================================

  describe('handleRequest - main menu', () => {
    it('should return main menu when text is empty', async () => {
      const result = await service.handleRequest('session1', '+237690000000', '');

      expect(result).toContain('CON');
      expect(result).toContain('Bienvenue chez Global Financial Solution');
      expect(result).toContain('1. Consulter solde');
      expect(result).toContain('2. Mini-releve');
      expect(result).toContain('3. Payer cotisation');
      expect(result).toContain('4. Rembourser credit');
    });

    it('should return END for invalid menu choice', async () => {
      const result = await service.handleRequest('session1', '+237690000000', '9');

      expect(result).toBe('END Option invalide. Reessayez.');
    });
  });

  // ==========================================================
  // RESPONSE FORMAT (CON vs END)
  // ==========================================================

  describe('response format', () => {
    it('should use CON prefix for intermediate menus (expecting more input)', async () => {
      const result = await service.handleRequest('session1', '+237690000000', '');
      expect(result.startsWith('CON')).toBe(true);
    });

    it('should use CON when requesting PIN entry', async () => {
      const result = await service.handleRequest('session1', '+237690000000', '1');
      expect(result).toBe('CON Entrez votre code PIN:');
    });

    it('should use END for terminal responses (auth failure)', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      const result = await service.handleRequest('session1', '+237690000000', '1*1234');
      expect(result.startsWith('END')).toBe(true);
    });
  });

  // ==========================================================
  // PIN AUTHENTICATION
  // ==========================================================

  describe('PIN authentication', () => {
    const mockClient = {
      id: 'client-1',
      clientNumber: 'CLI001',
      phone: '237690000000',
      status: 'ACTIVE',
      pin: '$2b$10$hashedpin',
    };

    it('should authenticate with valid PIN', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.account.findMany.mockResolvedValue([
        { type: 'CURRENT', balance: 50000, status: 'ACTIVE' },
      ]);

      const result = await service.handleRequest('session1', '+237690000000', '1*1234');

      expect(result).toContain('END Vos soldes:');
      expect(mockPrisma.client.findFirst).toHaveBeenCalled();
      expect(bcrypt.compare).toHaveBeenCalledWith('1234', mockClient.pin);
    });

    it('should reject invalid PIN', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.handleRequest('session1', '+237690000000', '1*9999');

      expect(result).toBe('END PIN incorrect');
    });

    it('should reject unrecognized phone number', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);

      const result = await service.handleRequest('session1', '+237690000000', '1*1234');

      expect(result).toBe('END Numero non reconnu');
    });

    it('should reject client without PIN configured', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({ ...mockClient, pin: null });

      const result = await service.handleRequest('session1', '+237690000000', '1*1234');

      expect(result).toBe('END PIN non configure. Rendez-vous en agence.');
    });

    it('should search multiple phone format variants', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);

      await service.handleRequest('session1', '+237690000000', '1*1234');

      const call = mockPrisma.client.findFirst.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR.length).toBeGreaterThan(1);
      expect(call.where.status).toBe('ACTIVE');
    });
  });

  // ==========================================================
  // 1. CONSULTER SOLDE
  // ==========================================================

  describe('handleRequest - consulter solde (option 1)', () => {
    const mockClient = {
      id: 'client-1',
      clientNumber: 'CLI001',
      phone: '237690000000',
      status: 'ACTIVE',
      pin: '$2b$10$hashedpin',
    };

    beforeEach(() => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    it('should prompt for PIN on first step', async () => {
      const result = await service.handleRequest('session1', '+237690000000', '1');
      expect(result).toBe('CON Entrez votre code PIN:');
    });

    it('should display account balances after PIN authentication', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        { type: 'CURRENT', balance: 150000, status: 'ACTIVE' },
        { type: 'SAVINGS', balance: 300000, status: 'ACTIVE' },
      ]);

      const result = await service.handleRequest('session1', '+237690000000', '1*1234');

      expect(result).toContain('END Vos soldes:');
      expect(result).toContain('Courant');
      expect(result).toContain('150 000');
      expect(result).toContain('Epargne');
      expect(result).toContain('300 000');
    });

    it('should handle no active accounts', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);

      const result = await service.handleRequest('session1', '+237690000000', '1*1234');

      expect(result).toBe('END Aucun compte actif trouve.');
    });

    it('should log audit after successful balance check', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        { type: 'CURRENT', balance: 50000, status: 'ACTIVE' },
      ]);

      await service.handleRequest('session1', '+237690000000', '1*1234');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONSULTATION_SOLDE',
          module: 'USSD',
        }),
      );
    });

    it('should display DAT account type label correctly', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        { type: 'DAT', balance: 1000000, status: 'ACTIVE' },
      ]);

      const result = await service.handleRequest('session1', '+237690000000', '1*1234');

      expect(result).toContain('DAT');
      expect(result).toContain('1 000 000');
    });
  });

  // ==========================================================
  // 2. MINI-RELEVE
  // ==========================================================

  describe('handleRequest - mini-releve (option 2)', () => {
    const mockClient = {
      id: 'client-1',
      clientNumber: 'CLI001',
      phone: '237690000000',
      status: 'ACTIVE',
      pin: '$2b$10$hashedpin',
    };

    beforeEach(() => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    it('should prompt for PIN on first step', async () => {
      const result = await service.handleRequest('session1', '+237690000000', '2');
      expect(result).toBe('CON Entrez votre code PIN:');
    });

    it('should display last 5 transactions', async () => {
      mockPrisma.account.findMany.mockResolvedValue([{ id: 'acc-1' }]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          type: 'DEPOSIT',
          amount: 100000,
          createdAt: new Date('2026-07-15'),
          fromAccountId: 'other',
          toAccountId: 'acc-1',
          status: 'COMPLETED',
        },
        {
          type: 'WITHDRAWAL',
          amount: 50000,
          createdAt: new Date('2026-07-14'),
          fromAccountId: 'acc-1',
          toAccountId: null,
          status: 'COMPLETED',
        },
      ]);

      const result = await service.handleRequest('session2', '+237690000000', '2*1234');

      expect(result).toContain('END Dernieres operations:');
      expect(result).toContain('Depot');
      expect(result).toContain('+100 000');
      expect(result).toContain('Retrait');
      expect(result).toContain('-50 000');
    });

    it('should handle no recent transactions', async () => {
      mockPrisma.account.findMany.mockResolvedValue([{ id: 'acc-1' }]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.handleRequest('session2', '+237690000000', '2*1234');

      expect(result).toBe('END Aucune transaction recente.');
    });

    it('should log audit after mini-releve', async () => {
      mockPrisma.account.findMany.mockResolvedValue([{ id: 'acc-1' }]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          type: 'DEPOSIT',
          amount: 100000,
          createdAt: new Date(),
          fromAccountId: 'other',
          toAccountId: 'acc-1',
          status: 'COMPLETED',
        },
      ]);

      await service.handleRequest('session2', '+237690000000', '2*1234');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MINI_RELEVE',
          module: 'USSD',
        }),
      );
    });
  });

  // ==========================================================
  // 3. PAYER COTISATION
  // ==========================================================

  describe('handleRequest - payer cotisation (option 3)', () => {
    const mockClient = {
      id: 'client-1',
      clientNumber: 'CLI001',
      phone: '237690000000',
      status: 'ACTIVE',
      pin: '$2b$10$hashedpin',
    };

    beforeEach(() => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    it('should prompt for PIN on first step', async () => {
      const result = await service.handleRequest('session1', '+237690000000', '3');
      expect(result).toBe('CON Entrez votre code PIN:');
    });

    it('should list active tontine memberships after PIN', async () => {
      mockPrisma.tontineMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine Mensuelle',
            contributionAmount: 25000,
            frequency: 'MONTHLY',
            currentRound: 1,
          },
        },
      ]);

      const result = await service.handleRequest('session3', '+237690000000', '3*1234');

      expect(result).toContain('CON Vos cotisations:');
      expect(result).toContain('Tontine Mensuelle');
      expect(result).toContain('25 000');
      expect(result).toContain('mois');
    });

    it('should show weekly frequency label', async () => {
      mockPrisma.tontineMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine Hebdo',
            contributionAmount: 5000,
            frequency: 'WEEKLY',
            currentRound: 1,
          },
        },
      ]);

      const result = await service.handleRequest('session3', '+237690000000', '3*1234');
      expect(result).toContain('sem');
    });

    it('should show daily frequency label', async () => {
      mockPrisma.tontineMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine Quotidienne',
            contributionAmount: 1000,
            frequency: 'DAILY',
            currentRound: 1,
          },
        },
      ]);

      const result = await service.handleRequest('session3', '+237690000000', '3*1234');
      expect(result).toContain('jour');
    });

    it('should handle no active memberships', async () => {
      mockPrisma.tontineMember.findMany.mockResolvedValue([]);

      const result = await service.handleRequest('session3', '+237690000000', '3*1234');

      expect(result).toBe('END Aucune cotisation active.');
    });

    it('should prompt for amount after selecting a tontine group', async () => {
      // First authenticate
      mockPrisma.tontineMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine Mensuelle',
            contributionAmount: 25000,
            frequency: 'MONTHLY',
            currentRound: 1,
          },
        },
      ]);

      // Authenticate first to create session
      await service.handleRequest('session4', '+237690000000', '3*1234');
      // Now select tontine group
      const result = await service.handleRequest('session4', '+237690000000', '3*1234*1');

      expect(result).toContain('CON');
      expect(result).toContain('Montant par defaut');
      expect(result).toContain('Entrez le montant a payer');
    });

    it('should show confirmation prompt after entering amount', async () => {
      mockPrisma.tontineMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine Mensuelle',
            contributionAmount: 25000,
            frequency: 'MONTHLY',
            currentRound: 1,
          },
        },
      ]);

      await service.handleRequest('session5', '+237690000000', '3*1234');
      const result = await service.handleRequest('session5', '+237690000000', '3*1234*1*25000');

      expect(result).toContain('CON Confirmer paiement');
      expect(result).toContain('25 000 FCFA');
      expect(result).toContain('1. Confirmer');
      expect(result).toContain('2. Annuler');
    });

    it('should reject invalid (non-numeric) amounts', async () => {
      mockPrisma.tontineMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine',
            contributionAmount: 25000,
            frequency: 'MONTHLY',
            currentRound: 1,
          },
        },
      ]);

      await service.handleRequest('session6', '+237690000000', '3*1234');
      const result = await service.handleRequest('session6', '+237690000000', '3*1234*1*abc');

      expect(result).toBe('END Montant invalide.');
    });

    it('should cancel on option 2 at confirmation step', async () => {
      mockPrisma.tontineMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine',
            contributionAmount: 25000,
            frequency: 'MONTHLY',
            currentRound: 1,
          },
        },
      ]);

      await service.handleRequest('session7', '+237690000000', '3*1234');
      const result = await service.handleRequest('session7', '+237690000000', '3*1234*1*25000*2');

      expect(result).toBe('END Operation annulee.');
    });

    it('should process payment on confirmation and send SMS', async () => {
      const mockMemberships = [
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine Mensuelle',
            contributionAmount: 25000,
            frequency: 'MONTHLY',
            currentRound: 1,
          },
        },
      ];
      mockPrisma.tontineMember.findMany.mockResolvedValue(mockMemberships);
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 100000,
        type: 'CURRENT',
        status: 'ACTIVE',
      });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.tontineRound.findFirst.mockResolvedValue({ id: 'round-1', roundNumber: 1 });
      mockPrisma.tontinePayment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.tontineMember.update.mockResolvedValue({});
      mockPrisma.account.update.mockResolvedValue({});

      // Authenticate
      await service.handleRequest('session8', '+237690000000', '3*1234');
      // Confirm payment
      const result = await service.handleRequest('session8', '+237690000000', '3*1234*1*25000*1');

      expect(result).toContain('END Paiement de 25 000 FCFA effectue avec succes.');
      expect(mockSmsService.send).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAIEMENT_COTISATION',
        }),
      );
    });

    it('should reject payment when insufficient balance', async () => {
      mockPrisma.tontineMember.findMany.mockResolvedValue([
        {
          id: 'member-1',
          clientId: 'client-1',
          isActive: true,
          group: {
            id: 'group-1',
            name: 'Tontine',
            contributionAmount: 25000,
            frequency: 'MONTHLY',
            currentRound: 1,
          },
        },
      ]);
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 100,
        type: 'CURRENT',
        status: 'ACTIVE',
      });

      await service.handleRequest('session9', '+237690000000', '3*1234');
      const result = await service.handleRequest('session9', '+237690000000', '3*1234*1*25000*1');

      expect(result).toBe('END Solde insuffisant.');
    });
  });

  // ==========================================================
  // 4. REMBOURSER CREDIT
  // ==========================================================

  describe('handleRequest - rembourser credit (option 4)', () => {
    const mockClient = {
      id: 'client-1',
      clientNumber: 'CLI001',
      phone: '237690000000',
      status: 'ACTIVE',
      pin: '$2b$10$hashedpin',
    };

    beforeEach(() => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    it('should prompt for PIN on first step', async () => {
      const result = await service.handleRequest('session1', '+237690000000', '4');
      expect(result).toBe('CON Entrez votre code PIN:');
    });

    it('should list active credits after PIN', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([
        { id: 'credit-1', creditNumber: 'CR001', remainingAmount: 500000, status: 'ACTIVE' },
        { id: 'credit-2', creditNumber: 'CR002', remainingAmount: 200000, status: 'DISBURSED' },
      ]);

      const result = await service.handleRequest('session10', '+237690000000', '4*1234');

      expect(result).toContain('CON Vos credits:');
      expect(result).toContain('CR001');
      expect(result).toContain('500 000');
      expect(result).toContain('CR002');
      expect(result).toContain('200 000');
    });

    it('should handle no active credits', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([]);

      const result = await service.handleRequest('session10', '+237690000000', '4*1234');

      expect(result).toBe('END Aucun credit actif.');
    });

    it('should show next repayment details when selecting a credit', async () => {
      const dueDate = new Date('2026-08-15');
      mockPrisma.credit.findMany.mockResolvedValue([
        { id: 'credit-1', creditNumber: 'CR001', remainingAmount: 500000, status: 'ACTIVE' },
      ]);
      mockPrisma.repayment.findFirst.mockResolvedValue({
        id: 'rep-1',
        amount: 50000,
        penalty: 0,
        moratoireAmount: 0,
        paidAmount: 0,
        dueDate,
        status: 'PENDING',
      });

      await service.handleRequest('session11', '+237690000000', '4*1234');
      const result = await service.handleRequest('session11', '+237690000000', '4*1234*1');

      expect(result).toContain('CON Echeance du');
      expect(result).toContain('50 000 FCFA');
      expect(result).toContain('1. Payer');
      expect(result).toContain('2. Annuler');
    });

    it('should handle no pending repayment', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([
        { id: 'credit-1', creditNumber: 'CR001', remainingAmount: 500000, status: 'ACTIVE' },
      ]);
      mockPrisma.repayment.findFirst.mockResolvedValue(null);

      await service.handleRequest('session11', '+237690000000', '4*1234');
      const result = await service.handleRequest('session11', '+237690000000', '4*1234*1');

      expect(result).toBe('END Aucune echeance en attente.');
    });

    it('should process repayment on confirmation', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([
        { id: 'credit-1', creditNumber: 'CR001', remainingAmount: 500000, status: 'ACTIVE' },
      ]);
      mockPrisma.repayment.findFirst.mockResolvedValue({
        id: 'rep-1',
        amount: 50000,
        penalty: 5000,
        moratoireAmount: 0,
        paidAmount: 0,
        dueDate: new Date('2026-08-15'),
        status: 'PENDING',
      });
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 200000,
        type: 'CURRENT',
        status: 'ACTIVE',
      });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.account.update.mockResolvedValue({});
      mockPrisma.credit.update.mockResolvedValue({});
      mockPrisma.repayment.update.mockResolvedValue({});
      mockPrisma.repayment.count.mockResolvedValue(2);

      await service.handleRequest('session12', '+237690000000', '4*1234');
      const result = await service.handleRequest('session12', '+237690000000', '4*1234*1*1');

      expect(result).toContain('END Echeance payee avec succes!');
      expect(result).toContain('55 000 FCFA');
      expect(mockSmsService.send).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REMBOURSEMENT_CREDIT' }),
      );
    });

    it('should mark credit as COMPLETED when all repayments are paid', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([
        { id: 'credit-1', creditNumber: 'CR001', remainingAmount: 50000, status: 'ACTIVE' },
      ]);
      mockPrisma.repayment.findFirst.mockResolvedValue({
        id: 'rep-1',
        amount: 50000,
        penalty: 0,
        moratoireAmount: 0,
        paidAmount: 0,
        dueDate: new Date('2026-08-15'),
        status: 'PENDING',
      });
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 200000,
        type: 'CURRENT',
        status: 'ACTIVE',
      });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.account.update.mockResolvedValue({});
      mockPrisma.credit.update.mockResolvedValue({});
      mockPrisma.repayment.update.mockResolvedValue({});
      // No remaining unpaid repayments
      mockPrisma.repayment.count.mockResolvedValue(0);

      await service.handleRequest('session13', '+237690000000', '4*1234');
      await service.handleRequest('session13', '+237690000000', '4*1234*1*1');

      // credit.update should have been called twice: once for remainingAmount, once for status COMPLETED
      expect(mockPrisma.credit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'COMPLETED' },
        }),
      );
    });

    it('should reject repayment when insufficient balance', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([
        { id: 'credit-1', creditNumber: 'CR001', remainingAmount: 500000, status: 'ACTIVE' },
      ]);
      mockPrisma.repayment.findFirst.mockResolvedValue({
        id: 'rep-1',
        amount: 50000,
        penalty: 0,
        moratoireAmount: 0,
        paidAmount: 0,
        dueDate: new Date('2026-08-15'),
        status: 'PENDING',
      });
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 100,
        type: 'CURRENT',
        status: 'ACTIVE',
      });

      await service.handleRequest('session14', '+237690000000', '4*1234');
      const result = await service.handleRequest('session14', '+237690000000', '4*1234*1*1');

      expect(result).toContain('END Solde insuffisant');
    });

    it('should cancel on option 2 at confirmation step', async () => {
      mockPrisma.credit.findMany.mockResolvedValue([
        { id: 'credit-1', creditNumber: 'CR001', remainingAmount: 500000, status: 'ACTIVE' },
      ]);

      await service.handleRequest('session15', '+237690000000', '4*1234');
      const result = await service.handleRequest('session15', '+237690000000', '4*1234*1*2');

      expect(result).toBe('END Operation annulee.');
    });
  });

  // ==========================================================
  // SESSION MANAGEMENT
  // ==========================================================

  describe('session management', () => {
    it('should create session on successful authentication', async () => {
      const mockClient = {
        id: 'client-1',
        clientNumber: 'CLI001',
        phone: '237690000000',
        status: 'ACTIVE',
        pin: '$2b$10$hashedpin',
      };
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.account.findMany.mockResolvedValue([
        { type: 'CURRENT', balance: 50000, status: 'ACTIVE' },
      ]);

      await service.handleRequest('session-mgmt-1', '+237690000000', '1*1234');

      // Session should exist - access private sessions map via any cast
      const session = (service as any).sessions.get('session-mgmt-1');
      expect(session).toBeDefined();
      expect(session.clientId).toBe('client-1');
      expect(session.verified).toBe(true);
    });

    it('should expire sessions older than TTL', async () => {
      const mockClient = {
        id: 'client-1',
        clientNumber: 'CLI001',
        phone: '237690000000',
        status: 'ACTIVE',
        pin: '$2b$10$hashedpin',
      };
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.account.findMany.mockResolvedValue([
        { type: 'CURRENT', balance: 50000, status: 'ACTIVE' },
      ]);

      await service.handleRequest('session-old', '+237690000000', '1*1234');

      // Manually set session to be expired
      const sessions = (service as any).sessions;
      const session = sessions.get('session-old');
      session.createdAt = Date.now() - 10 * 60 * 1000; // 10 minutes ago (> 5 min TTL)

      // getSession should return undefined for expired session
      const result = (service as any).getSession('session-old');
      expect(result).toBeUndefined();
    });

    it('should clean up expired sessions', async () => {
      // Manually add expired sessions
      const sessions = (service as any).sessions;
      sessions.set('expired-1', {
        clientId: 'c1',
        verified: true,
        phone: '123',
        createdAt: Date.now() - 10 * 60 * 1000,
      });
      sessions.set('valid-1', {
        clientId: 'c2',
        verified: true,
        phone: '456',
        createdAt: Date.now(),
      });

      (service as any).cleanExpiredSessions();

      expect(sessions.has('expired-1')).toBe(false);
      expect(sessions.has('valid-1')).toBe(true);
    });

    it('should clear interval on module destroy', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      service.onModuleDestroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });
});
