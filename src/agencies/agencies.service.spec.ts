import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AgenciesService } from './agencies.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AgenciesService', () => {
  let service: AgenciesService;
  let prisma: PrismaService;

  const mockPrisma = {
    agency: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    credit: {
      aggregate: jest.fn(),
    },
    transaction: {
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    cashRegister: {
      count: jest.fn(),
    },
    vault: {
      findUnique: jest.fn(),
    },
    feeConfig: {
      findMany: jest.fn(),
    },
    creditProduct: {
      findMany: jest.fn(),
    },
    savingsProduct: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgenciesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AgenciesService>(AgenciesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── CREATE ──────────────────────────────────────────────────────────────

  describe('create', () => {
    const createData = {
      name: 'Agence Douala',
      code: 'DLA-001',
      address: '123 Rue Principale',
      city: 'Douala',
      region: 'Littoral',
      phone: '+237690000001',
    };

    it('should create an agency successfully', async () => {
      mockPrisma.agency.findUnique.mockResolvedValue(null);
      const created = { id: 'agency-1', ...createData };
      mockPrisma.agency.create.mockResolvedValue(created);

      const result = await service.create(createData);

      expect(mockPrisma.agency.findUnique).toHaveBeenCalledWith({
        where: { code: createData.code },
      });
      expect(mockPrisma.agency.create).toHaveBeenCalledWith({
        data: createData,
        include: { parent: true },
      });
      expect(result).toEqual(created);
    });

    it('should throw ConflictException when code already exists', async () => {
      mockPrisma.agency.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createData)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.agency.create).not.toHaveBeenCalled();
    });

    it('should pass parentId when provided', async () => {
      const dataWithParent = { ...createData, parentId: 'parent-1' };
      mockPrisma.agency.findUnique.mockResolvedValue(null);
      mockPrisma.agency.create.mockResolvedValue({ id: 'agency-2', ...dataWithParent });

      await service.create(dataWithParent);

      expect(mockPrisma.agency.create).toHaveBeenCalledWith({
        data: dataWithParent,
        include: { parent: true },
      });
    });
  });

  // ─── FIND ALL ────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all agencies ordered by name', async () => {
      const agencies = [
        { id: '1', name: 'Agence A' },
        { id: '2', name: 'Agence B' },
      ];
      mockPrisma.agency.findMany.mockResolvedValue(agencies);

      const result = await service.findAll();

      expect(mockPrisma.agency.findMany).toHaveBeenCalledWith({
        include: {
          parent: true,
          _count: { select: { clients: true, users: true } },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(agencies);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return an agency by id', async () => {
      const agency = { id: 'agency-1', name: 'Agence Douala' };
      mockPrisma.agency.findUnique.mockResolvedValue(agency);

      const result = await service.findOne('agency-1');

      expect(mockPrisma.agency.findUnique).toHaveBeenCalledWith({
        where: { id: 'agency-1' },
        include: {
          parent: true,
          children: true,
          _count: { select: { clients: true, users: true, transactions: true } },
        },
      });
      expect(result).toEqual(agency);
    });

    it('should throw NotFoundException when agency not found', async () => {
      mockPrisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── UPDATE ──────────────────────────────────────────────────────────────

  describe('update', () => {
    const updateData = { name: 'Agence Douala Updated' };

    it('should update an agency', async () => {
      const existing = { id: 'agency-1', name: 'Agence Douala' };
      mockPrisma.agency.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, ...updateData };
      mockPrisma.agency.update.mockResolvedValue(updated);

      const result = await service.update('agency-1', updateData);

      expect(mockPrisma.agency.update).toHaveBeenCalledWith({
        where: { id: 'agency-1' },
        data: updateData,
        include: { parent: true },
      });
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when agency does not exist', async () => {
      mockPrisma.agency.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', updateData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── GET CONSOLIDATED VIEW ──────────────────────────────────────────────

  describe('getConsolidatedView', () => {
    it('should return consolidated view of all active agencies', async () => {
      const agencies = [
        {
          id: 'a1',
          name: 'Agence A',
          code: 'A001',
          city: 'Douala',
          region: 'Littoral',
          isActive: true,
          _count: { clients: 10, users: 3, transactions: 50, accounts: 15 },
        },
      ];
      mockPrisma.agency.findMany.mockResolvedValue(agencies);
      mockPrisma.account.aggregate
        .mockResolvedValueOnce({ _sum: { balance: 500000 } })
        .mockResolvedValueOnce({ _sum: { balance: 200000 } })
        .mockResolvedValueOnce({ _sum: { balance: 100000 } });
      mockPrisma.credit.aggregate.mockResolvedValue({
        _sum: { remainingAmount: 300000 },
        _count: 5,
      });
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 1000000, fees: 5000 },
        _count: 20,
      });
      mockPrisma.cashRegister.count.mockResolvedValue(2);
      mockPrisma.vault.findUnique.mockResolvedValue({ balance: 750000 });

      const result = await service.getConsolidatedView();

      expect(result.agencies).toHaveLength(1);
      expect(result.agencies[0].soldes.courant).toBe(500000);
      expect(result.agencies[0].soldes.epargne).toBe(200000);
      expect(result.agencies[0].soldes.dat).toBe(100000);
      expect(result.agencies[0].soldes.total).toBe(800000);
      expect(result.agencies[0].credits.count).toBe(5);
      expect(result.agencies[0].credits.encours).toBe(300000);
      expect(result.agencies[0].activiteMois.volume).toBe(1000000);
      expect(result.agencies[0].caissesOuvertes).toBe(2);
      expect(result.agencies[0].soldeCoffre).toBe(750000);
      expect(result.consolide).toBeDefined();
    });

    it('should handle null balances gracefully', async () => {
      const agencies = [
        {
          id: 'a1',
          name: 'Agence A',
          code: 'A001',
          city: 'Douala',
          region: 'Littoral',
          isActive: true,
          _count: { clients: 0, users: 0, transactions: 0, accounts: 0 },
        },
      ];
      mockPrisma.agency.findMany.mockResolvedValue(agencies);
      mockPrisma.account.aggregate.mockResolvedValue({ _sum: { balance: null } });
      mockPrisma.credit.aggregate.mockResolvedValue({
        _sum: { remainingAmount: null },
        _count: 0,
      });
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: null, fees: null },
        _count: 0,
      });
      mockPrisma.cashRegister.count.mockResolvedValue(0);
      mockPrisma.vault.findUnique.mockResolvedValue(null);

      const result = await service.getConsolidatedView();

      expect(result.agencies[0].soldes.total).toBe(0);
      expect(result.agencies[0].soldeCoffre).toBe(0);
    });
  });

  // ─── INTER-AGENCY TRANSFER ──────────────────────────────────────────────

  describe('interAgencyTransfer', () => {
    const transferDto = {
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 100000,
      notes: 'Transfer test',
    };

    it('should throw NotFoundException when source account not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(
        service.interAgencyTransfer(transferDto, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when destination account not found', async () => {
      mockPrisma.account.findUnique
        .mockResolvedValueOnce({ id: 'acc-1', agencyId: 'ag-1', balance: 200000, agency: { name: 'A' } })
        .mockResolvedValueOnce(null);

      await expect(
        service.interAgencyTransfer(transferDto, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when both accounts are in the same agency', async () => {
      const fromAccount = { id: 'acc-1', agencyId: 'ag-1', balance: 200000, agency: { name: 'A' } };
      const toAccount = { id: 'acc-2', agencyId: 'ag-1', balance: 50000, agency: { name: 'A' } };
      mockPrisma.account.findUnique
        .mockResolvedValueOnce(fromAccount)
        .mockResolvedValueOnce(toAccount);

      await expect(
        service.interAgencyTransfer(transferDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when balance is insufficient', async () => {
      const fromAccount = { id: 'acc-1', agencyId: 'ag-1', balance: 50000, agency: { name: 'A' } };
      const toAccount = { id: 'acc-2', agencyId: 'ag-2', balance: 10000, agency: { name: 'B' } };
      mockPrisma.account.findUnique
        .mockResolvedValueOnce(fromAccount)
        .mockResolvedValueOnce(toAccount);

      await expect(
        service.interAgencyTransfer(transferDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should perform inter-agency transfer successfully', async () => {
      const fromAccount = { id: 'acc-1', agencyId: 'ag-1', balance: 200000, agency: { name: 'Agence A' } };
      const toAccount = { id: 'acc-2', agencyId: 'ag-2', balance: 50000, agency: { name: 'Agence B' } };
      mockPrisma.account.findUnique
        .mockResolvedValueOnce(fromAccount)
        .mockResolvedValueOnce(toAccount);
      mockPrisma.$transaction.mockResolvedValue({
        txDebit: { id: 'tx-1' },
        txCredit: { id: 'tx-2' },
      });

      const result = await service.interAgencyTransfer(transferDto, 'user-1');

      expect(result.message).toBe('Transfert inter-agence effectue');
      expect(result.fromAgency).toBe('Agence A');
      expect(result.toAgency).toBe('Agence B');
      expect(result.amount).toBe(100000);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── GET GLOBAL SETTINGS ───────────────────────────────────────────────

  describe('getGlobalSettings', () => {
    it('should return global settings with summary', async () => {
      const feeConfigs = [{ id: '1' }, { id: '2' }];
      const creditProducts = [{ id: '1' }];
      const savingsProducts = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const agencies = [
        { id: '1', name: 'A', code: 'A01', isActive: true },
        { id: '2', name: 'B', code: 'B01', isActive: false },
      ];

      mockPrisma.feeConfig.findMany.mockResolvedValue(feeConfigs);
      mockPrisma.creditProduct.findMany.mockResolvedValue(creditProducts);
      mockPrisma.savingsProduct.findMany.mockResolvedValue(savingsProducts);
      mockPrisma.agency.findMany.mockResolvedValue(agencies);

      const result = await service.getGlobalSettings();

      expect(result.feeConfigs).toEqual(feeConfigs);
      expect(result.creditProducts).toEqual(creditProducts);
      expect(result.savingsProducts).toEqual(savingsProducts);
      expect(result.agencies).toEqual(agencies);
      expect(result.summary.totalFeeConfigs).toBe(2);
      expect(result.summary.totalCreditProducts).toBe(1);
      expect(result.summary.totalSavingsProducts).toBe(3);
      expect(result.summary.totalAgencies).toBe(2);
      expect(result.summary.activeAgencies).toBe(1);
    });
  });
});
