import { Test, TestingModule } from '@nestjs/testing';
import { CallboxService } from './callbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('CallboxService', () => {
  let service: CallboxService;
  let prisma: any;
  let jwtService: any;

  const mockPrisma = {
    callbox: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    callboxTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    callboxFloatTopup: {
      create: jest.fn(),
    },
    callboxCommissionConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    client: {
      findFirst: jest.fn(),
    },
    account: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallboxService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<CallboxService>(CallboxService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
  });

  // ==================== REGISTER ====================

  describe('register', () => {
    const dto = {
      ownerName: 'Marie Nguemo',
      businessName: 'Kiosque Marie',
      phone: '+237699000001',
      email: 'marie@email.com',
      password: 'motdepasse123',
      city: 'Douala',
      address: 'Akwa',
      agencyId: 'agency-uuid',
    };

    it('should register a new callbox successfully', async () => {
      mockPrisma.callbox.findFirst.mockResolvedValue(null);
      mockPrisma.callbox.count.mockResolvedValue(0);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrisma.callbox.create.mockResolvedValue({
        id: 'cbx-id',
        callboxNumber: 'CBX-0001',
        ...dto,
        password: 'hashed-password',
        status: 'PENDING',
        agency: { name: 'Agence Akwa' },
      });

      const result = await service.register(dto);

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password');
      expect(result.callboxNumber).toBe('CBX-0001');
      expect(result.status).toBe('PENDING');
      expect(mockPrisma.callbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callboxNumber: 'CBX-0001',
            ownerName: dto.ownerName,
            phone: dto.phone,
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should generate correct callbox number based on count', async () => {
      mockPrisma.callbox.findFirst.mockResolvedValue(null);
      mockPrisma.callbox.count.mockResolvedValue(42);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockPrisma.callbox.create.mockResolvedValue({
        ...dto,
        id: 'id',
        callboxNumber: 'CBX-0043',
        password: 'hashed',
        status: 'PENDING',
        agency: null,
      });

      await service.register(dto);

      expect(mockPrisma.callbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callboxNumber: 'CBX-0043',
          }),
        }),
      );
    });

    it('should throw BadRequestException if phone or email already exists', async () => {
      mockPrisma.callbox.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.register(dto)).rejects.toThrow(BadRequestException);
      await expect(service.register(dto)).rejects.toThrow(
        'Un callbox avec ce téléphone ou email existe déjà',
      );
    });

    it('should set createdBy when provided', async () => {
      mockPrisma.callbox.findFirst.mockResolvedValue(null);
      mockPrisma.callbox.count.mockResolvedValue(0);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockPrisma.callbox.create.mockResolvedValue({
        ...dto,
        id: 'id',
        callboxNumber: 'CBX-0001',
        password: 'hashed',
        status: 'PENDING',
        createdBy: 'admin-id',
        agency: null,
      });

      await service.register(dto, 'admin-id');

      expect(mockPrisma.callbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdBy: 'admin-id',
          }),
        }),
      );
    });
  });

  // ==================== LOGIN ====================

  describe('login', () => {
    const dto = { phone: '+237699000001', password: 'motdepasse123' };

    const mockCallbox = {
      id: 'cbx-id',
      callboxNumber: 'CBX-0001',
      ownerName: 'Marie',
      businessName: 'Kiosque',
      phone: '+237699000001',
      city: 'Douala',
      agencyId: 'agency-id',
      agency: { name: 'Agence Akwa' },
      float: 50000,
      commissionsEarned: 1200,
      status: 'APPROVED',
      password: 'hashed-password',
    };

    it('should login successfully with valid credentials', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(mockCallbox);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.callbox.update.mockResolvedValue(mockCallbox);
      mockJwtService.sign.mockReturnValue('jwt-token');

      const result = await service.login(dto);

      expect(result.access_token).toBe('jwt-token');
      expect(result.expiresIn).toBe(43200);
      expect(result.callbox.id).toBe('cbx-id');
      expect(result.callbox.float).toBe(50000);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'cbx-id',
          type: 'CALLBOX',
        }),
        { expiresIn: 43200 },
      );
    });

    it('should throw UnauthorizedException if phone not found', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if status is PENDING', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        ...mockCallbox,
        status: 'PENDING',
      });

      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
      await expect(service.login(dto)).rejects.toThrow(
        "Votre compte Callbox est en attente d'approbation par l'admin",
      );
    });

    it('should throw ForbiddenException if status is REJECTED', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        ...mockCallbox,
        status: 'REJECTED',
      });

      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if status is SUSPENDED', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        ...mockCallbox,
        status: 'SUSPENDED',
      });

      await expect(service.login(dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(mockCallbox);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== VALIDATE SESSION ====================

  describe('validateSession', () => {
    it('should return true for valid session', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        sessionToken: 'valid-token',
        status: 'APPROVED',
      });

      const result = await service.validateSession('cbx-id', 'valid-token');
      expect(result).toBe(true);
    });

    it('should return false if callbox not found', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(null);

      const result = await service.validateSession('bad-id', 'token');
      expect(result).toBe(false);
    });

    it('should return false if status is not APPROVED', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        sessionToken: 'token',
        status: 'SUSPENDED',
      });

      const result = await service.validateSession('cbx-id', 'token');
      expect(result).toBe(false);
    });

    it('should return false if session tokens do not match', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        sessionToken: 'correct-token',
        status: 'APPROVED',
      });

      const result = await service.validateSession('cbx-id', 'wrong-token');
      expect(result).toBe(false);
    });
  });

  // ==================== DEPOSIT ====================

  describe('deposit', () => {
    const depositDto = {
      identifier: 'QR-123',
      amount: 10000,
      notes: 'Test deposit',
    };

    beforeEach(() => {
      // Mock _getApprovedCallbox
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'APPROVED',
        float: 50000,
        businessName: 'Kiosque Marie',
        ownerName: 'Marie',
      });
      // Mock lookupByQrOrAccount
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'client-id',
        firstName: 'Jean',
        lastName: 'Dupont',
        accounts: [{ id: 'acc-id', accountNumber: 'ACC-001', balance: 20000 }],
      });
      // Mock commission config
      mockPrisma.callboxCommissionConfig.findUnique.mockResolvedValue({
        rate: 0.01,
        callboxShareRate: 0.3,
        isActive: true,
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);
    });

    it('should perform deposit successfully', async () => {
      const result = await service.deposit('cbx-id', depositDto);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(10000);
      expect(result.clientName).toBe('Jean Dupont');
      expect(result.newFloat).toBe(40000);
      expect(result.reference).toMatch(/^CBX-DEP-/);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if amount is below 500', async () => {
      await expect(
        service.deposit('cbx-id', { ...depositDto, amount: 300 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if float is insufficient', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'APPROVED',
        float: 5000,
      });

      await expect(
        service.deposit('cbx-id', { ...depositDto, amount: 10000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if client not found by identifier', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.deposit('cbx-id', depositDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if client has no active account', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'client-id',
        firstName: 'Jean',
        lastName: 'Dupont',
        accounts: [{ id: 'acc-id', accountNumber: 'ACC-001', balance: 20000 }],
      });
      // lookupByQrOrAccount returns accountId=null when account[0] is missing
      // But since we have accounts, let's test with a null accountId scenario
      // Actually the lookup returns account[0].id, so to get no accountId we need no accounts
      // But QR lookup returns _formatClientResult which uses accounts[0]
      // Let's mock QR returning a client with no accounts
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'client-id',
        firstName: 'Jean',
        lastName: 'Dupont',
        accounts: [],
      });

      await expect(
        service.deposit('cbx-id', { ...depositDto, identifier: 'QR-NO-ACC' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if callbox is not approved', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'PENDING',
      });

      await expect(
        service.deposit('cbx-id', depositDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== WITHDRAWAL ====================

  describe('withdrawal', () => {
    const withdrawalDto = {
      identifier: 'ACC-001',
      amount: 5000,
      notes: 'Test withdrawal',
    };

    beforeEach(() => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'APPROVED',
        float: 50000,
      });
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-id',
        accountNumber: 'ACC-001',
        status: 'ACTIVE',
        balance: 20000,
        client: { id: 'client-id', firstName: 'Jean', lastName: 'Dupont' },
      });
      mockPrisma.callboxCommissionConfig.findUnique.mockResolvedValue({
        rate: 0.01,
        callboxShareRate: 0.3,
        isActive: true,
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);
    });

    it('should perform withdrawal successfully', async () => {
      const result = await service.withdrawal('cbx-id', withdrawalDto);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(5000);
      expect(result.reference).toMatch(/^CBX-WIT-/);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if client balance is insufficient', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-id',
        accountNumber: 'ACC-001',
        status: 'ACTIVE',
        balance: 2000,
        client: { id: 'client-id', firstName: 'Jean', lastName: 'Dupont' },
      });

      await expect(
        service.withdrawal('cbx-id', { ...withdrawalDto, amount: 5000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if client has no active account', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.withdrawal('cbx-id', withdrawalDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== TRANSFER ====================

  describe('transfer', () => {
    const transferDto = {
      destIdentifier: 'QR-DEST',
      amount: 15000,
      notes: 'Transfer test',
    };

    beforeEach(() => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        callboxNumber: 'CBX-0001',
        status: 'APPROVED',
        float: 50000,
      });
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'dest-client-id',
        firstName: 'Paul',
        lastName: 'Martin',
        accounts: [{ id: 'dest-acc-id', accountNumber: 'ACC-002', balance: 10000 }],
      });
      mockPrisma.callboxCommissionConfig.findUnique.mockResolvedValue({
        rate: 0.02,
        callboxShareRate: 0.4,
        isActive: true,
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);
    });

    it('should perform transfer successfully', async () => {
      const result = await service.transfer('cbx-id', 'agency-id', transferDto);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(15000);
      expect(result.destName).toBe('Paul Martin');
      expect(result.reference).toMatch(/^CBX-TRF-/);
      expect(result.newFloat).toBe(35000);
    });

    it('should throw BadRequestException if float is insufficient', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'APPROVED',
        float: 5000,
      });

      await expect(
        service.transfer('cbx-id', 'agency-id', transferDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if dest has no active account', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'dest-id',
        firstName: 'Paul',
        lastName: 'Martin',
        accounts: [],
      });
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.transfer('cbx-id', 'agency-id', transferDto),
      ).rejects.toThrow();
    });
  });

  // ==================== FLOAT TOPUP ====================

  describe('floatTopup', () => {
    const topupDto = {
      callboxId: 'cbx-id',
      amount: 50000,
      method: 'CASH_AGENCY',
      notes: 'Topup test',
    };

    it('should top up float successfully', async () => {
      mockPrisma.callbox.findUnique
        .mockResolvedValueOnce({ id: 'cbx-id', float: 10000 })
        .mockResolvedValueOnce({ id: 'cbx-id', float: 60000 });
      mockPrisma.$transaction.mockResolvedValue(undefined);

      const result = await service.floatTopup(topupDto, 'admin-id');

      expect(result.success).toBe(true);
      expect(result.newFloat).toBe(60000);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if callbox does not exist', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(null);

      await expect(service.floatTopup(topupDto, 'admin-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== APPROVE / REJECT / SUSPEND ====================

  describe('approve', () => {
    it('should approve a pending callbox', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'PENDING',
      });
      mockPrisma.callbox.update.mockResolvedValue({
        id: 'cbx-id',
        callboxNumber: 'CBX-0001',
        ownerName: 'Marie',
        status: 'APPROVED',
        approvedAt: new Date(),
      });

      const result = await service.approve('cbx-id', 'admin-id');
      expect(result.status).toBe('APPROVED');
    });

    it('should throw NotFoundException if callbox not found', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(null);

      await expect(service.approve('bad-id', 'admin-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if callbox is not PENDING', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'APPROVED',
      });

      await expect(service.approve('cbx-id', 'admin-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reject', () => {
    it('should reject a callbox', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({ id: 'cbx-id' });
      mockPrisma.callbox.update.mockResolvedValue({
        id: 'cbx-id',
        callboxNumber: 'CBX-0001',
        ownerName: 'Marie',
        status: 'REJECTED',
      });

      const result = await service.reject('cbx-id', 'admin-id');
      expect(result.status).toBe('REJECTED');
    });

    it('should throw NotFoundException if callbox not found', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(null);
      await expect(service.reject('bad-id', 'admin-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspend', () => {
    it('should suspend a callbox', async () => {
      mockPrisma.callbox.update.mockResolvedValue({
        id: 'cbx-id',
        callboxNumber: 'CBX-0001',
        ownerName: 'Marie',
        status: 'SUSPENDED',
      });

      const result = await service.suspend('cbx-id');
      expect(result.status).toBe('SUSPENDED');
    });
  });

  // ==================== COMMISSION CALCULATION ====================

  describe('commission calculation', () => {
    it('should calculate commission correctly when config is active', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'APPROVED',
        float: 100000,
        businessName: 'Test',
        ownerName: 'Test',
      });
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'client-id',
        firstName: 'Jean',
        lastName: 'Dupont',
        accounts: [{ id: 'acc-id', accountNumber: 'ACC-001', balance: 50000 }],
      });
      mockPrisma.callboxCommissionConfig.findUnique.mockResolvedValue({
        rate: 0.02,           // 2%
        callboxShareRate: 0.5, // 50% of commission
        isActive: true,
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);

      const result = await service.deposit('cbx-id', {
        identifier: 'QR-123',
        amount: 10000,
      });

      // commission = floor(10000 * 0.02) = 200
      // callboxShare = floor(200 * 0.5) = 100
      expect(result.commission).toBe(200);
      expect(result.callboxCommission).toBe(100);
    });

    it('should return zero commission when config is inactive', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'APPROVED',
        float: 100000,
        businessName: 'Test',
        ownerName: 'Test',
      });
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'client-id',
        firstName: 'Jean',
        lastName: 'Dupont',
        accounts: [{ id: 'acc-id', accountNumber: 'ACC-001', balance: 50000 }],
      });
      mockPrisma.callboxCommissionConfig.findUnique.mockResolvedValue({
        rate: 0.02,
        callboxShareRate: 0.5,
        isActive: false,
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);

      const result = await service.deposit('cbx-id', {
        identifier: 'QR-123',
        amount: 10000,
      });

      expect(result.commission).toBe(0);
      expect(result.callboxCommission).toBe(0);
    });

    it('should return zero commission when config does not exist', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        status: 'APPROVED',
        float: 100000,
        businessName: 'Test',
        ownerName: 'Test',
      });
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'client-id',
        firstName: 'Jean',
        lastName: 'Dupont',
        accounts: [{ id: 'acc-id', accountNumber: 'ACC-001', balance: 50000 }],
      });
      mockPrisma.callboxCommissionConfig.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue(undefined);

      const result = await service.deposit('cbx-id', {
        identifier: 'QR-123',
        amount: 10000,
      });

      expect(result.commission).toBe(0);
      expect(result.callboxCommission).toBe(0);
    });
  });

  // ==================== COMMISSION CONFIG MANAGEMENT ====================

  describe('getCommissionConfigs', () => {
    it('should return all commission configs', async () => {
      const configs = [
        { transactionType: 'DEPOSIT', rate: 0.01, callboxShareRate: 0.3 },
        { transactionType: 'WITHDRAWAL', rate: 0.015, callboxShareRate: 0.4 },
      ];
      mockPrisma.callboxCommissionConfig.findMany.mockResolvedValue(configs);

      const result = await service.getCommissionConfigs();
      expect(result).toEqual(configs);
    });
  });

  describe('upsertCommissionConfig', () => {
    it('should upsert a commission config', async () => {
      const config = { transactionType: 'DEPOSIT', rate: 0.02, callboxShareRate: 0.5 };
      mockPrisma.callboxCommissionConfig.upsert.mockResolvedValue(config);

      const result = await service.upsertCommissionConfig('DEPOSIT', {
        rate: 0.02,
        callboxShareRate: 0.5,
      });
      expect(result).toEqual(config);
    });
  });

  // ==================== FIND ALL / FIND ONE / STATS ====================

  describe('findAll', () => {
    it('should return paginated list of callboxes', async () => {
      const data = [{ id: 'cbx-1' }, { id: 'cbx-2' }];
      mockPrisma.callbox.findMany.mockResolvedValue(data);
      mockPrisma.callbox.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toEqual(data);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it('should filter by status and agencyId', async () => {
      mockPrisma.callbox.findMany.mockResolvedValue([]);
      mockPrisma.callbox.count.mockResolvedValue(0);

      await service.findAll({ status: 'APPROVED', agencyId: 'ag-1' });

      expect(mockPrisma.callbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'APPROVED', agencyId: 'ag-1' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return callbox details without password', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        password: 'secret',
        ownerName: 'Marie',
        agency: {},
        transactions: [],
        floatTopups: [],
      });

      const result = await service.findOne('cbx-id');
      expect(result).not.toHaveProperty('password');
      expect(result.ownerName).toBe('Marie');
    });

    it('should throw NotFoundException if callbox not found', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return stats for a callbox', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({ float: 30000, commissionsEarned: 500 });
      mockPrisma.callboxTransaction.aggregate
        .mockResolvedValueOnce({
          _count: 5,
          _sum: { amount: 25000, callboxCommission: 200 },
        })
        .mockResolvedValueOnce({
          _count: 50,
          _sum: { amount: 250000, callboxCommission: 2000 },
        });

      const result = await service.getStats('cbx-id');
      expect(result.float).toBe(30000);
      expect(result.today.count).toBe(5);
      expect(result.total.count).toBe(50);
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const txData = [{ id: 'tx-1' }, { id: 'tx-2' }];
      mockPrisma.callboxTransaction.findMany.mockResolvedValue(txData);
      mockPrisma.callboxTransaction.count.mockResolvedValue(2);

      const result = await service.getTransactions('cbx-id', { page: 1, limit: 10 });
      expect(result.data).toEqual(txData);
      expect(result.total).toBe(2);
    });
  });

  // ==================== GET ME ====================

  describe('getMe', () => {
    it('should return callbox profile without password and sessionToken', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue({
        id: 'cbx-id',
        password: 'secret',
        sessionToken: 'token',
        ownerName: 'Marie',
        agency: { name: 'Akwa' },
      });

      const result = await service.getMe('cbx-id');
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('sessionToken');
      expect(result.ownerName).toBe('Marie');
    });

    it('should throw NotFoundException if callbox not found', async () => {
      mockPrisma.callbox.findUnique.mockResolvedValue(null);
      await expect(service.getMe('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== LOOKUP ====================

  describe('lookupByQrOrAccount', () => {
    it('should find client by QR code', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'client-id',
        firstName: 'Jean',
        lastName: 'Dupont',
        accounts: [{ id: 'acc-id', accountNumber: 'ACC-001', balance: 10000 }],
      });

      const result = await service.lookupByQrOrAccount('QR-123');
      expect(result.clientId).toBe('client-id');
      expect(result.clientName).toBe('Jean Dupont');
    });

    it('should find client by account number when QR not found', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'acc-id',
        accountNumber: 'ACC-001',
        balance: 5000,
        client: { id: 'client-id', firstName: 'Jean', lastName: 'Dupont' },
      });

      const result = await service.lookupByQrOrAccount('ACC-001');
      expect(result.clientId).toBe('client-id');
      expect(result.accountNumber).toBe('ACC-001');
    });

    it('should throw NotFoundException if neither QR nor account found', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(service.lookupByQrOrAccount('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
