import { Test, TestingModule } from '@nestjs/testing';
import { CheckbooksService } from './checkbooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('CheckbooksService', () => {
  let service: CheckbooksService;

  const mockPrisma = {
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    checkbook: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    cheque: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    client: {
      findFirst: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAudit = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckbooksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<CheckbooksService>(CheckbooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== REQUEST CHECKBOOK ====================

  describe('requestCheckbook', () => {
    const dto = { accountId: 'acc-1', totalLeaves: 25 };

    it('should create a new checkbook with cheques', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc-1', status: 'ACTIVE' });
      mockPrisma.checkbook.findFirst
        .mockResolvedValueOnce(null)  // no active checkbook
        .mockResolvedValueOnce(null); // no last checkbook (for series start)
      const createdCheckbook = {
        id: 'cb-1',
        accountId: 'acc-1',
        seriesStart: 1,
        seriesEnd: 25,
        totalLeaves: 25,
        status: 'ACTIVE',
        cheques: Array.from({ length: 25 }, (_, i) => ({
          chequeNumber: `CHQ-${String(i + 1).padStart(6, '0')}`,
          status: 'DISPONIBLE',
        })),
      };
      mockPrisma.checkbook.create.mockResolvedValue(createdCheckbook);

      const result = await service.requestCheckbook(dto, 'user-1');

      expect(result.totalLeaves).toBe(25);
      expect(result.cheques).toHaveLength(25);
      expect(mockPrisma.checkbook.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE_CHECKBOOK',
          module: 'CHECKBOOKS',
        }),
      );
    });

    it('should throw NotFoundException if account not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(service.requestCheckbook(dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if account is not active', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc-1', status: 'CLOSED' });

      await expect(service.requestCheckbook(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if an active checkbook with available cheques exists', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc-1', status: 'ACTIVE' });
      mockPrisma.checkbook.findFirst.mockResolvedValue({
        id: 'existing-cb',
        seriesStart: 1,
        seriesEnd: 25,
        cheques: [{ status: 'DISPONIBLE' }],
      });

      await expect(service.requestCheckbook(dto)).rejects.toThrow(BadRequestException);
    });

    it('should continue series numbering from last checkbook', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc-1', status: 'ACTIVE' });
      mockPrisma.checkbook.findFirst
        .mockResolvedValueOnce(null) // no active checkbook with available cheques
        .mockResolvedValueOnce({ seriesEnd: 25 }); // last checkbook ended at 25
      mockPrisma.checkbook.create.mockResolvedValue({
        id: 'cb-2',
        seriesStart: 26,
        seriesEnd: 50,
        totalLeaves: 25,
        status: 'ACTIVE',
        cheques: [],
      });

      await service.requestCheckbook(dto);

      expect(mockPrisma.checkbook.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            seriesStart: 26,
            seriesEnd: 50,
          }),
        }),
      );
    });

    it('should not call audit.log when userId is not provided', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc-1', status: 'ACTIVE' });
      mockPrisma.checkbook.findFirst.mockResolvedValue(null);
      mockPrisma.checkbook.create.mockResolvedValue({
        id: 'cb-1',
        cheques: [],
        totalLeaves: 25,
      });

      await service.requestCheckbook(dto);

      expect(mockAudit.log).not.toHaveBeenCalled();
    });
  });

  // ==================== EMIT CHEQUE ====================

  describe('emitCheque', () => {
    const dto = { chequeNumber: 'CHQ-000001', amount: 150000, beneficiary: 'Jean Dupont' };

    it('should emit a cheque successfully', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        id: 'chq-1',
        status: 'DISPONIBLE',
      });
      mockPrisma.cheque.update.mockResolvedValue({
        id: 'chq-1',
        status: 'EMIS',
        amount: 150000,
        beneficiary: 'Jean Dupont',
      });

      const result = await service.emitCheque('chq-1', dto, 'user-1');

      expect(result.status).toBe('EMIS');
      expect(result.amount).toBe(150000);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EMIT_CHEQUE' }),
      );
    });

    it('should throw NotFoundException if cheque not found', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue(null);

      await expect(service.emitCheque('bad-id', dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if cheque is not DISPONIBLE', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        id: 'chq-1',
        status: 'EMIS',
      });

      await expect(service.emitCheque('chq-1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== ENCAISSER CHEQUE ====================

  describe('encaisserCheque', () => {
    const baseDto = { chequeNumber: 'CHQ-000001' };

    const mockChequeEmis = {
      id: 'chq-1',
      chequeNumber: 'CHQ-000001',
      status: 'EMIS',
      amount: 50000,
      beneficiary: 'Paul Martin',
      checkbook: {
        account: {
          id: 'src-acc',
          balance: 100000,
          agencyId: 'ag-1',
          client: { id: 'cl-1', firstName: 'Jean', lastName: 'Dupont', raisonSociale: null },
        },
      },
    };

    it('should encaisser as retrait (no destination account)', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue(mockChequeEmis);
      const txResult = {
        cheque: { ...mockChequeEmis, status: 'ENCAISSE' },
        transaction: { id: 'tx-1', type: 'WITHDRAWAL' },
      };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn({
        cheque: { update: jest.fn().mockResolvedValue({ ...mockChequeEmis, status: 'ENCAISSE' }) },
        account: {
          update: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn(),
        },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1', type: 'WITHDRAWAL' }) },
      }));

      const result = await service.encaisserCheque('chq-1', baseDto, 'user-1');

      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RETRAIT_CHEQUE' }),
      );
    });

    it('should encaisser as virement (with destination account)', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue(mockChequeEmis);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn({
        cheque: { update: jest.fn().mockResolvedValue({ ...mockChequeEmis, status: 'ENCAISSE' }) },
        account: {
          update: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue({ id: 'dest-acc', status: 'ACTIVE' }),
        },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-2', type: 'TRANSFER' }) },
      }));

      const result = await service.encaisserCheque(
        'chq-1',
        { ...baseDto, accountId: 'dest-acc' },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ENCAISSER_CHEQUE' }),
      );
    });

    it('should throw NotFoundException if cheque not found', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue(null);

      await expect(service.encaisserCheque('bad-id', baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if cheque is in OPPOSITION', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        ...mockChequeEmis,
        status: 'OPPOSITION',
      });

      await expect(service.encaisserCheque('chq-1', baseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if cheque is not EMIS', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        ...mockChequeEmis,
        status: 'DISPONIBLE',
      });

      await expect(service.encaisserCheque('chq-1', baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if insufficient balance', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        ...mockChequeEmis,
        amount: 200000,
        checkbook: {
          account: {
            ...mockChequeEmis.checkbook.account,
            balance: 50000,
          },
        },
      });

      await expect(service.encaisserCheque('chq-1', baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if cheque amount is invalid (zero)', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        ...mockChequeEmis,
        amount: 0,
      });

      await expect(service.encaisserCheque('chq-1', baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==================== OPPOSE CHEQUE ====================

  describe('opposeCheque', () => {
    const dto = { motif: 'PERTE' };

    it('should put a cheque in opposition', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        id: 'chq-1',
        chequeNumber: 'CHQ-000001',
        status: 'DISPONIBLE',
      });
      mockPrisma.cheque.update.mockResolvedValue({
        id: 'chq-1',
        status: 'OPPOSITION',
        oppositionMotif: 'PERTE',
      });

      const result = await service.opposeCheque('chq-1', dto, 'user-1');

      expect(result.status).toBe('OPPOSITION');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OPPOSE_CHEQUE' }),
      );
    });

    it('should throw NotFoundException if cheque not found', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue(null);

      await expect(service.opposeCheque('bad-id', dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if cheque is already in OPPOSITION', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        id: 'chq-1',
        status: 'OPPOSITION',
      });

      await expect(service.opposeCheque('chq-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if cheque is already ENCAISSE', async () => {
      mockPrisma.cheque.findUnique.mockResolvedValue({
        id: 'chq-1',
        status: 'ENCAISSE',
      });

      await expect(service.opposeCheque('chq-1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== OPPOSE CHECKBOOK ====================

  describe('opposeCheckbook', () => {
    it('should oppose all eligible cheques in a checkbook', async () => {
      mockPrisma.checkbook.findUnique.mockResolvedValue({
        id: 'cb-1',
        cheques: [
          { status: 'DISPONIBLE' },
          { status: 'EMIS' },
          { status: 'ENCAISSE' },
        ],
      });
      mockPrisma.cheque.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.opposeCheckbook('cb-1', 'VOL', 'user-1');

      expect(result.chequesAffected).toBe(2);
      expect(result.motif).toBe('VOL');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OPPOSE_CHECKBOOK' }),
      );
    });

    it('should throw NotFoundException if checkbook not found', async () => {
      mockPrisma.checkbook.findUnique.mockResolvedValue(null);

      await expect(service.opposeCheckbook('bad-id', 'PERTE')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== FIND CHEQUE BY NUMBER ====================

  describe('findChequeByNumber', () => {
    it('should return cheque with account and client info', async () => {
      const mockCheque = {
        id: 'chq-1',
        chequeNumber: 'CHQ-000001',
        status: 'EMIS',
        amount: 150000,
        beneficiary: 'Jean',
        emittedAt: new Date(),
        checkbook: {
          account: {
            id: 'acc-1',
            accountNumber: 'ACC-001',
            type: 'CURRENT',
            balance: 200000,
            status: 'ACTIVE',
            client: {
              id: 'cl-1',
              firstName: 'Marie',
              lastName: 'Nguemo',
            },
          },
        },
      };
      mockPrisma.cheque.findFirst.mockResolvedValue(mockCheque);

      const result = await service.findChequeByNumber('CHQ-000001');

      expect(result.cheque.chequeNumber).toBe('CHQ-000001');
      expect(result.account.accountNumber).toBe('ACC-001');
      expect(result.client.firstName).toBe('Marie');
    });

    it('should throw NotFoundException if cheque not found', async () => {
      mockPrisma.cheque.findFirst.mockResolvedValue(null);

      await expect(service.findChequeByNumber('CHQ-999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== GET ACCOUNT INFO ====================

  describe('getAccountInfo', () => {
    it('should return account, client and checkbooks', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        accountNumber: 'ACC-001',
        type: 'CURRENT',
        balance: 100000,
        status: 'ACTIVE',
        client: { id: 'cl-1', firstName: 'Jean', lastName: 'Dupont' },
      });
      mockPrisma.checkbook.findMany.mockResolvedValue([]);

      const result = await service.getAccountInfo('acc-1');

      expect(result.account.accountNumber).toBe('ACC-001');
      expect(result.client.firstName).toBe('Jean');
      expect(result.checkbooks).toEqual([]);
    });

    it('should throw NotFoundException if account not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(service.getAccountInfo('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== GET CHECKBOOKS ====================

  describe('getCheckbooks', () => {
    it('should return checkbooks with status counts', async () => {
      mockPrisma.checkbook.findMany.mockResolvedValue([
        {
          id: 'cb-1',
          seriesStart: 1,
          seriesEnd: 25,
          cheques: [
            { status: 'DISPONIBLE' },
            { status: 'DISPONIBLE' },
            { status: 'EMIS' },
            { status: 'ENCAISSE' },
          ],
        },
      ]);

      const result = await service.getCheckbooks('acc-1');

      expect(result).toHaveLength(1);
      expect(result[0].chequeCounts.DISPONIBLE).toBe(2);
      expect(result[0].chequeCounts.EMIS).toBe(1);
      expect(result[0].chequeCounts.ENCAISSE).toBe(1);
      expect(result[0].chequeCounts.OPPOSITION).toBe(0);
      expect(result[0].totalCheques).toBe(4);
      expect(result[0]).not.toHaveProperty('cheques');
    });
  });

  // ==================== GET CHEQUES ====================

  describe('getCheques', () => {
    it('should return paginated cheques', async () => {
      const cheques = [{ id: 'chq-1' }, { id: 'chq-2' }];
      mockPrisma.cheque.findMany.mockResolvedValue(cheques);
      mockPrisma.cheque.count.mockResolvedValue(2);

      const result = await service.getCheques({ page: 1, limit: 20 });

      expect(result.data).toEqual(cheques);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
    });

    it('should filter by checkbookId', async () => {
      mockPrisma.cheque.findMany.mockResolvedValue([]);
      mockPrisma.cheque.count.mockResolvedValue(0);

      await service.getCheques({ checkbookId: 'cb-1' });

      expect(mockPrisma.cheque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ checkbookId: 'cb-1' }),
        }),
      );
    });

    it('should filter by accountId', async () => {
      mockPrisma.cheque.findMany.mockResolvedValue([]);
      mockPrisma.cheque.count.mockResolvedValue(0);

      await service.getCheques({ accountId: 'acc-1' });

      expect(mockPrisma.cheque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            checkbook: { accountId: 'acc-1' },
          }),
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrisma.cheque.findMany.mockResolvedValue([]);
      mockPrisma.cheque.count.mockResolvedValue(0);

      await service.getCheques({ status: 'EMIS' });

      expect(mockPrisma.cheque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'EMIS' }),
        }),
      );
    });
  });

  // ==================== GET REGISTRE ====================

  describe('getRegistre', () => {
    it('should return paginated registre data', async () => {
      mockPrisma.cheque.findMany.mockResolvedValue([]);
      mockPrisma.cheque.count.mockResolvedValue(0);

      const result = await service.getRegistre({ page: 1, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should filter by accountId', async () => {
      mockPrisma.cheque.findMany.mockResolvedValue([]);
      mockPrisma.cheque.count.mockResolvedValue(0);

      await service.getRegistre({ accountId: 'acc-1' });

      expect(mockPrisma.cheque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            checkbook: { accountId: 'acc-1' },
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.cheque.findMany.mockResolvedValue([]);
      mockPrisma.cheque.count.mockResolvedValue(0);

      await service.getRegistre({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      expect(mockPrisma.cheque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2025-01-01'),
              lte: new Date('2025-12-31'),
            },
          }),
        }),
      );
    });

    it('should filter by status and date range together', async () => {
      mockPrisma.cheque.findMany.mockResolvedValue([]);
      mockPrisma.cheque.count.mockResolvedValue(0);

      await service.getRegistre({
        status: 'OPPOSITION',
        startDate: '2025-06-01',
      });

      expect(mockPrisma.cheque.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'OPPOSITION',
            createdAt: { gte: new Date('2025-06-01') },
          }),
        }),
      );
    });
  });
});
