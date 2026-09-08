import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SmsService } from '../sms/sms.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

describe('ClientsService', () => {
  let service: ClientsService;
  let prisma: PrismaService;

  const mockPrisma = {
    client: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    mandataire: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    account: {
      updateMany: jest.fn(),
    },
    credit: {
      updateMany: jest.fn(),
    },
    savingsAccount: {
      updateMany: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockSmsService = {
    sendCredentials: jest.fn().mockResolvedValue(true),
  };

  const mockWhatsappService = {
    sendCredentials: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: WhatsappService, useValue: mockWhatsappService },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  // ==================== CREATE ====================

  describe('create', () => {
    const basePPDto = {
      clientType: 'PHYSIQUE' as any,
      phone: '+237690000000',
      address: 'Rue 123',
      city: 'Douala',
      region: 'Littoral',
      firstName: 'Jean',
      lastName: 'Kamga',
      gender: 'MALE' as any,
      dateOfBirth: '1990-05-15',
      idDocumentType: 'CNI' as any,
      idDocumentNumber: '123456789',
    };

    const basePMDto = {
      clientType: 'MORALE' as any,
      phone: '+237690000001',
      address: 'BP 1234',
      city: 'Yaounde',
      region: 'Centre',
      raisonSociale: 'SARL Test',
      formeJuridique: 'SARL' as any,
      numeroEnregistrement: 'RCCM-001',
      dateConstitution: '2020-01-01',
    };

    it('should create a personne physique successfully', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.client.create.mockResolvedValue({ id: 'c1', ...basePPDto, clientNumber: 'CLI-00000001' });
      mockPrisma.client.update.mockResolvedValue({});

      const result = await service.create(basePPDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('c1');
      expect(mockPrisma.client.create).toHaveBeenCalledTimes(1);
      // Password update after creation
      expect(mockPrisma.client.update).toHaveBeenCalled();
    });

    it('should create a personne morale successfully', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.client.create.mockResolvedValue({ id: 'c2', ...basePMDto, clientNumber: 'CLI-00000002' });
      mockPrisma.client.update.mockResolvedValue({});

      const result = await service.create(basePMDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('c2');
      expect(mockPrisma.client.create).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException for invalid phone format', async () => {
      const dto = { ...basePPDto, phone: '0690000000' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for phone missing +237', async () => {
      const dto = { ...basePPDto, phone: '+33690000000' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for duplicate phone', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(basePPDto)).rejects.toThrow(ConflictException);
      await expect(service.create(basePPDto)).rejects.toThrow(
        'Un client avec ce numero de telephone existe deja',
      );
    });

    it('should throw ConflictException for duplicate ID document (PP)', async () => {
      // First call: phone check (no duplicate)
      // Second call: idDocumentNumber check (duplicate found)
      mockPrisma.client.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });

      await expect(service.create(basePPDto)).rejects.toThrow(
        'Un client avec ce numero de piece existe deja',
      );
    });

    it('should throw ConflictException for duplicate registration number (PM)', async () => {
      // First call: phone check (no duplicate)
      // Second call: numeroEnregistrement check (duplicate found)
      mockPrisma.client.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });

      await expect(service.create(basePMDto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for expired ID document (PP)', async () => {
      const dto = {
        ...basePPDto,
        dateExpirationPiece: '2020-01-01', // expired
      };

      await expect(service.create(dto)).rejects.toThrow('piece d\'identite est expiree');
    });

    it('should throw BadRequestException for invalid CNI format', async () => {
      const dto = {
        ...basePPDto,
        idDocumentType: 'CNI' as any,
        idDocumentNumber: 'ABC123',
      };

      await expect(service.create(dto)).rejects.toThrow('numero de CNI doit contenir exactement 9 chiffres');
    });

    it('should send SMS and WhatsApp credentials after creation', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.client.create.mockResolvedValue({ id: 'c1', clientNumber: 'CLI-001', ...basePPDto });
      mockPrisma.client.update.mockResolvedValue({});

      await service.create(basePPDto);

      expect(mockSmsService.sendCredentials).toHaveBeenCalledWith(
        basePPDto.phone,
        `${basePPDto.firstName} ${basePPDto.lastName}`,
        'CLI-001',
        expect.any(String),
      );
      expect(mockWhatsappService.sendCredentials).toHaveBeenCalled();
    });

    it('should log audit when userId is provided', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.client.create.mockResolvedValue({ id: 'c1', clientNumber: 'CLI-001', ...basePPDto });
      mockPrisma.client.update.mockResolvedValue({});

      await service.create(basePPDto, 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'CREATE',
          module: 'CLIENTS',
          entityId: 'c1',
        }),
      );
    });

    it('should calculate KYC score before creation', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.client.create.mockResolvedValue({ id: 'c1', clientNumber: 'CLI-001', ...basePPDto });
      mockPrisma.client.update.mockResolvedValue({});

      await service.create(basePPDto);

      // The create call data should include kycScore and kycScoreLabel
      const createCall = mockPrisma.client.create.mock.calls[0][0];
      expect(createCall.data).toHaveProperty('kycScore');
      expect(createCall.data).toHaveProperty('kycScoreLabel');
    });
  });

  // ==================== FIND ALL ====================

  describe('findAll', () => {
    it('should return paginated clients', async () => {
      const clients = [{ id: 'c1' }, { id: 'c2' }];
      mockPrisma.client.findMany.mockResolvedValue(clients);
      mockPrisma.client.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual(clients);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should apply filters', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await service.findAll({
        agencyId: 'agency-1',
        status: 'ACTIVE',
        clientType: 'PHYSIQUE',
        search: 'Jean',
        page: 1,
        limit: 10,
      });

      const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
      expect(callArgs.where.agencyId).toBe('agency-1');
      expect(callArgs.where.status).toBe('ACTIVE');
      expect(callArgs.where.clientType).toBe('PHYSIQUE');
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.skip).toBe(0);
      expect(callArgs.take).toBe(10);
    });

    it('should use default pagination values', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await service.findAll({});

      const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
      expect(callArgs.skip).toBe(0);
      expect(callArgs.take).toBe(20);
    });

    it('should calculate totalPages correctly', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(55);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
    });
  });

  // ==================== FIND ONE ====================

  describe('findOne', () => {
    it('should return client when found', async () => {
      const client = { id: 'c1', clientNumber: 'CLI-001', firstName: 'Jean' };
      mockPrisma.client.findUnique.mockResolvedValue(client);

      const result = await service.findOne('c1');

      expect(result).toEqual(client);
      expect(mockPrisma.client.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1' } }),
      );
    });

    it('should throw NotFoundException when client not found', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('nonexistent')).rejects.toThrow('Client non trouve');
    });

    it('should include related entities', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1' });

      await service.findOne('c1');

      const callArgs = mockPrisma.client.findUnique.mock.calls[0][0];
      expect(callArgs.include).toHaveProperty('agency');
      expect(callArgs.include).toHaveProperty('accounts');
      expect(callArgs.include).toHaveProperty('credits');
      expect(callArgs.include).toHaveProperty('savingsAccounts');
      expect(callArgs.include).toHaveProperty('mandataires');
      expect(callArgs.include).toHaveProperty('mandatairesDe');
    });
  });

  // ==================== UPDATE ====================

  describe('update', () => {
    it('should update client successfully', async () => {
      const existing = { id: 'c1', clientNumber: 'CLI-001' };
      mockPrisma.client.findUnique.mockResolvedValue(existing);
      mockPrisma.client.update.mockResolvedValue({ ...existing, firstName: 'Pierre' });

      const result = await service.update('c1', { firstName: 'Pierre' } as any);

      expect(result.firstName).toBe('Pierre');
      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
        }),
      );
    });

    it('should convert date strings to Date objects', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.client.update.mockResolvedValue({ id: 'c1' });

      await service.update('c1', {
        dateOfBirth: '1990-05-15',
        dateExpirationPiece: '2030-01-01',
        dateConstitution: '2020-06-01',
      } as any);

      const callArgs = mockPrisma.client.update.mock.calls[0][0];
      expect(callArgs.data.dateOfBirth).toBeInstanceOf(Date);
      expect(callArgs.data.dateExpirationPiece).toBeInstanceOf(Date);
      expect(callArgs.data.dateConstitution).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException for non-existing client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should log audit when userId is provided', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', clientNumber: 'CLI-001' });
      mockPrisma.client.update.mockResolvedValue({ id: 'c1' });

      await service.update('c1', { firstName: 'Pierre' } as any, 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'UPDATE',
          module: 'CLIENTS',
        }),
      );
    });
  });

  // ==================== UPDATE STATUS ====================

  describe('updateStatus', () => {
    it('should update client status', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', clientNumber: 'CLI-001' });
      mockPrisma.client.update.mockResolvedValue({ id: 'c1', status: 'SUSPENDED' });

      const result = await service.updateStatus('c1', 'SUSPENDED');

      expect(result.status).toBe('SUSPENDED');
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { status: 'SUSPENDED' },
      });
    });

    it('should throw NotFoundException for non-existing client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('nonexistent', 'ACTIVE')).rejects.toThrow(NotFoundException);
    });

    it('should log audit when userId is provided', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', clientNumber: 'CLI-001' });
      mockPrisma.client.update.mockResolvedValue({ id: 'c1', status: 'BLOCKED' });

      await service.updateStatus('c1', 'BLOCKED', 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          details: expect.stringContaining('ACTIVE -> BLOCKED'),
        }),
      );
    });
  });

  // ==================== VERIFY KYC ====================

  describe('verifyKyc', () => {
    it('should set kycVerified to true', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', clientNumber: 'CLI-001' });
      mockPrisma.client.update.mockResolvedValue({ id: 'c1', kycVerified: true });

      const result = await service.verifyKyc('c1');

      expect(result.kycVerified).toBe(true);
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { kycVerified: true },
      });
    });

    it('should throw NotFoundException for non-existing client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.verifyKyc('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should log audit when userId is provided', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', clientNumber: 'CLI-001' });
      mockPrisma.client.update.mockResolvedValue({ id: 'c1', kycVerified: true });

      await service.verifyKyc('c1', 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          details: expect.stringContaining('KYC valide'),
        }),
      );
    });
  });

  // ==================== CHECK DUPLICATE ====================

  describe('checkDuplicate', () => {
    it('should return no duplicates when conditions are empty', async () => {
      const result = await service.checkDuplicate({});

      expect(result).toEqual({ duplicates: [], hasDuplicates: false });
      expect(mockPrisma.client.findMany).not.toHaveBeenCalled();
    });

    it('should search by phone', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      await service.checkDuplicate({ phone: '+237690000000' });

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: expect.arrayContaining([expect.objectContaining({ phone: expect.any(Object) })]) },
        }),
      );
    });

    it('should search by idDocumentNumber', async () => {
      mockPrisma.client.findMany.mockResolvedValue([{ id: 'dup1' }]);

      const result = await service.checkDuplicate({ idDocumentNumber: '123456789' });

      expect(result.hasDuplicates).toBe(true);
      expect(result.duplicates).toHaveLength(1);
    });

    it('should search by firstName + lastName combo', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      await service.checkDuplicate({ firstName: 'Jean', lastName: 'Kamga' });

      const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            AND: expect.arrayContaining([
              { firstName: { contains: 'Jean' } },
              { lastName: { contains: 'Kamga' } },
            ]),
          }),
        ]),
      );
    });

    it('should search by numeroEnregistrement', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      await service.checkDuplicate({ numeroEnregistrement: 'RCCM-001' });

      expect(mockPrisma.client.findMany).toHaveBeenCalled();
    });

    it('should limit results to 5', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);

      await service.checkDuplicate({ phone: '+237690000000' });

      const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
      expect(callArgs.take).toBe(5);
    });
  });

  // ==================== CALCULATE KYC SCORE ====================

  describe('calculateKycScore', () => {
    describe('Personne Physique', () => {
      it('should return 0 for empty PP client', () => {
        const result = service.calculateKycScore({ clientType: 'PHYSIQUE' });

        expect(result.score).toBe(0);
        expect(result.label).toBe('Insuffisant');
      });

      it('should score profilePhoto as 15 points', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          profilePhoto: 'photo.jpg',
        });

        expect(result.details['Photo profil']).toBe(15);
        expect(result.score).toBe(15);
      });

      it('should score idDocumentType as 10 points', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          idDocumentType: 'CNI',
        });

        expect(result.details['Type piece']).toBe(10);
      });

      it('should score idDocumentNumber as 10 points', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          idDocumentNumber: '123456789',
        });

        expect(result.details['Numero piece']).toBe(10);
      });

      it('should score idDocumentPhoto as 10 points', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          idDocumentPhoto: 'doc.jpg',
        });

        expect(result.details['Photo piece']).toBe(10);
      });

      it('should score non-expired dateExpirationPiece as 10 points', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 5);
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          dateExpirationPiece: futureDate.toISOString(),
        });

        expect(result.details['Piece non expiree']).toBe(10);
      });

      it('should score expired piece as 0 points', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          dateExpirationPiece: '2020-01-01',
        });

        expect(result.details['Piece non expiree']).toBe(0);
      });

      it('should score complete address as 10 points', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          address: 'Rue 123',
          city: 'Douala',
          region: 'Littoral',
        });

        expect(result.details['Adresse complete']).toBe(10);
      });

      it('should score signatureData as 10 points', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          signatureData: 'base64data',
        });

        expect(result.details['Signature']).toBe(10);
      });

      it('should return "Excellent" for score >= 80', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 5);
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          profilePhoto: 'photo.jpg',       // 15
          idDocumentType: 'CNI',           // 10
          idDocumentNumber: '123456789',   // 10
          idDocumentPhoto: 'doc.jpg',      // 10
          dateExpirationPiece: futureDate.toISOString(), // 10
          address: 'Rue', city: 'Douala', region: 'Littoral', // 10
          signatureData: 'sig',            // 10
          profession: 'Dev',              // 5
          revenuMensuel: 500000,          // 5
          phoneSecondaire: '+237222000000', // 5
        });

        expect(result.score).toBe(90);
        expect(result.label).toBe('Excellent');
      });

      it('should return "Bon" for score >= 60 and < 80', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 5);
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          profilePhoto: 'photo.jpg',       // 15
          idDocumentType: 'CNI',           // 10
          idDocumentNumber: '123456789',   // 10
          idDocumentPhoto: 'doc.jpg',      // 10
          dateExpirationPiece: futureDate.toISOString(), // 10
          address: 'Rue', city: 'Douala', region: 'Littoral', // 10
        });

        expect(result.score).toBe(65);
        expect(result.label).toBe('Bon');
      });

      it('should return "Moyen" for score >= 40 and < 60', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          profilePhoto: 'photo.jpg',     // 15
          idDocumentType: 'CNI',         // 10
          idDocumentNumber: '123456789', // 10
          idDocumentPhoto: 'doc.jpg',    // 10
        });

        expect(result.score).toBe(45);
        expect(result.label).toBe('Moyen');
      });

      it('should return "Insuffisant" for score < 40', () => {
        const result = service.calculateKycScore({
          clientType: 'PHYSIQUE',
          profilePhoto: 'photo.jpg', // 15
        });

        expect(result.score).toBe(15);
        expect(result.label).toBe('Insuffisant');
      });
    });

    describe('Personne Morale', () => {
      it('should return 0 for empty PM client', () => {
        const result = service.calculateKycScore({ clientType: 'MORALE' });

        expect(result.score).toBe(0);
        expect(result.label).toBe('Insuffisant');
      });

      it('should score raisonSociale as 15 points', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          raisonSociale: 'SARL Test',
        });

        expect(result.details['Raison sociale']).toBe(15);
      });

      it('should score formeJuridique as 15 points', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          formeJuridique: 'SARL',
        });

        expect(result.details['Forme juridique']).toBe(15);
      });

      it('should score numeroEnregistrement as 15 points', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          numeroEnregistrement: 'RCCM-001',
        });

        expect(result.details['N\u00b0 Enregistrement']).toBe(15);
      });

      it('should score identifiantFiscal (NIF) as 10 points', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          identifiantFiscal: 'NIF-001',
        });

        expect(result.details['NIF']).toBe(10);
      });

      it('should score dateConstitution as 10 points', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          dateConstitution: '2020-01-01',
        });

        expect(result.details['Date constitution']).toBe(10);
      });

      it('should score address as 15 points for PM', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          address: 'BP 1234',
          city: 'Yaounde',
          region: 'Centre',
        });

        expect(result.details['Adresse complete']).toBe(15);
      });

      it('should score signataire(s) as 20 points', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          mandataires: [{ isSignataire: true }],
        });

        expect(result.details['Signataire(s)']).toBe(20);
      });

      it('should score 0 for non-signataire mandataires', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          mandataires: [{ isSignataire: false }],
        });

        expect(result.details['Signataire(s)']).toBe(0);
      });

      it('should return "Excellent" for full PM score (100)', () => {
        const result = service.calculateKycScore({
          clientType: 'MORALE',
          raisonSociale: 'SARL Test',        // 15
          formeJuridique: 'SARL',            // 15
          numeroEnregistrement: 'RCCM-001',  // 15
          identifiantFiscal: 'NIF-001',      // 10
          dateConstitution: '2020-01-01',    // 10
          address: 'BP', city: 'YDE', region: 'Centre', // 15
          mandataires: [{ isSignataire: true }], // 20
        });

        expect(result.score).toBe(100);
        expect(result.label).toBe('Excellent');
      });
    });
  });

  // ==================== MANDATAIRES ====================

  describe('addMandataire', () => {
    const dto = {
      clientPhysiqueId: 'pp-1',
      role: 'GERANT' as any,
      isSignataire: true,
      maxOperationAmount: 5000000,
    };

    it('should add a mandataire successfully', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'pm-1', clientType: 'MORALE', raisonSociale: 'SARL' })
        .mockResolvedValueOnce({ id: 'pp-1', clientType: 'PHYSIQUE', firstName: 'Jean', lastName: 'K' });
      mockPrisma.mandataire.findUnique.mockResolvedValue(null);
      mockPrisma.mandataire.create.mockResolvedValue({ id: 'm1', ...dto });

      const result = await service.addMandataire('pm-1', dto);

      expect(result.id).toBe('m1');
      expect(mockPrisma.mandataire.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if morale client not found', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.addMandataire('nonexistent', dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if client is not MORALE', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'pp-1', clientType: 'PHYSIQUE' });

      await expect(service.addMandataire('pp-1', dto)).rejects.toThrow(BadRequestException);
      await expect(service.addMandataire('pp-1', dto)).rejects.toThrow('pas une personne morale');
    });

    it('should throw NotFoundException if physique client not found', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'pm-1', clientType: 'MORALE' })
        .mockResolvedValueOnce(null);

      await expect(service.addMandataire('pm-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if mandataire is not PHYSIQUE', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'pm-1', clientType: 'MORALE', raisonSociale: 'Test' })
        .mockResolvedValueOnce({ id: 'pm-2', clientType: 'MORALE' });

      await expect(service.addMandataire('pm-1', dto)).rejects.toThrow(
        'Le mandataire doit etre une personne physique',
      );
    });

    it('should throw ConflictException if mandataire already linked', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'pm-1', clientType: 'MORALE' })
        .mockResolvedValueOnce({ id: 'pp-1', clientType: 'PHYSIQUE' });
      mockPrisma.mandataire.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.addMandataire('pm-1', dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('getMandataires', () => {
    it('should return mandataires for a client morale', async () => {
      const mandataires = [{ id: 'm1' }, { id: 'm2' }];
      mockPrisma.mandataire.findMany.mockResolvedValue(mandataires);

      const result = await service.getMandataires('pm-1');

      expect(result).toEqual(mandataires);
      expect(mockPrisma.mandataire.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientMoraleId: 'pm-1' } }),
      );
    });
  });

  describe('updateMandataire', () => {
    it('should update mandataire successfully', async () => {
      mockPrisma.mandataire.findUnique.mockResolvedValue({
        id: 'm1',
        role: 'GERANT',
        isSignataire: false,
        clientPhysique: { firstName: 'Jean', lastName: 'K' },
        clientMorale: { raisonSociale: 'SARL' },
      });
      mockPrisma.mandataire.update.mockResolvedValue({ id: 'm1', role: 'DG', isSignataire: true });

      const result = await service.updateMandataire('m1', { role: 'DG' as any, isSignataire: true });

      expect(result.role).toBe('DG');
      expect(result.isSignataire).toBe(true);
    });

    it('should throw NotFoundException for non-existing mandataire', async () => {
      mockPrisma.mandataire.findUnique.mockResolvedValue(null);

      await expect(service.updateMandataire('nonexistent', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMandataire', () => {
    it('should delete mandataire successfully', async () => {
      mockPrisma.mandataire.findUnique.mockResolvedValue({
        id: 'm1',
        role: 'GERANT',
        isSignataire: false,
        clientPhysique: { firstName: 'Jean', lastName: 'K' },
        clientMorale: { raisonSociale: 'SARL' },
      });
      mockPrisma.mandataire.delete.mockResolvedValue({ id: 'm1' });

      const result = await service.removeMandataire('m1');

      expect(result.id).toBe('m1');
      expect(mockPrisma.mandataire.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });

    it('should throw NotFoundException for non-existing mandataire', async () => {
      mockPrisma.mandataire.findUnique.mockResolvedValue(null);

      await expect(service.removeMandataire('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should log audit when userId is provided', async () => {
      mockPrisma.mandataire.findUnique.mockResolvedValue({
        id: 'm1',
        role: 'GERANT',
        isSignataire: false,
        clientPhysique: { firstName: 'Jean', lastName: 'K' },
        clientMorale: { raisonSociale: 'SARL Test' },
      });
      mockPrisma.mandataire.delete.mockResolvedValue({ id: 'm1' });

      await service.removeMandataire('m1', 'user-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          module: 'MANDATAIRES',
        }),
      );
    });
  });

  // ==================== MERGE CLIENTS ====================

  describe('mergeClients', () => {
    it('should throw BadRequestException when merging same client', async () => {
      await expect(service.mergeClients('c1', 'c1')).rejects.toThrow(BadRequestException);
      await expect(service.mergeClients('c1', 'c1')).rejects.toThrow('fusionner un client avec lui-meme');
    });

    it('should throw BadRequestException when types differ', async () => {
      mockPrisma.client.findUnique
        .mockResolvedValueOnce({ id: 'c1', clientType: 'PHYSIQUE' })
        .mockResolvedValueOnce({ id: 'c2', clientType: 'MORALE' });

      await expect(service.mergeClients('c1', 'c2')).rejects.toThrow(
        'Impossible de fusionner une personne physique avec une personne morale',
      );
    });

    it('should transfer accounts, credits, savings from secondary to primary', async () => {
      const primary = { id: 'c1', clientType: 'PHYSIQUE', clientNumber: 'CLI-001', firstName: 'Jean', lastName: 'K', accounts: [] };
      const secondary = { id: 'c2', clientType: 'PHYSIQUE', clientNumber: 'CLI-002', firstName: 'Jean', lastName: 'Ka', accounts: [{ id: 'a1' }] };

      // findOne calls (initial + final)
      mockPrisma.client.findUnique
        .mockResolvedValueOnce(primary)   // findOne(primaryId)
        .mockResolvedValueOnce(secondary) // findOne(secondaryId)
        .mockResolvedValueOnce({ ...primary }); // findOne at end (return)

      mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.credit.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.savingsAccount.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.client.update.mockResolvedValue(primary);
      mockPrisma.client.delete.mockResolvedValue(secondary);

      await service.mergeClients('c1', 'c2');

      expect(mockPrisma.account.updateMany).toHaveBeenCalledWith({
        where: { clientId: 'c2' },
        data: { clientId: 'c1' },
      });
      expect(mockPrisma.credit.updateMany).toHaveBeenCalledWith({
        where: { clientId: 'c2' },
        data: { clientId: 'c1' },
      });
      expect(mockPrisma.savingsAccount.updateMany).toHaveBeenCalledWith({
        where: { clientId: 'c2' },
        data: { clientId: 'c1' },
      });
      expect(mockPrisma.client.delete).toHaveBeenCalledWith({ where: { id: 'c2' } });
    });

    it('should transfer mandataires for MORALE type', async () => {
      const primary = { id: 'pm1', clientType: 'MORALE', clientNumber: 'CLI-001', raisonSociale: 'A', accounts: [] };
      const secondary = { id: 'pm2', clientType: 'MORALE', clientNumber: 'CLI-002', raisonSociale: 'B', accounts: [] };

      mockPrisma.client.findUnique
        .mockResolvedValueOnce(primary)
        .mockResolvedValueOnce(secondary)
        .mockResolvedValueOnce(primary);

      mockPrisma.account.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.credit.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.savingsAccount.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mandataire.findMany.mockResolvedValue([{ id: 'm1', clientPhysiqueId: 'pp-1' }]);
      mockPrisma.mandataire.findUnique.mockResolvedValue(null); // not already linked
      mockPrisma.mandataire.update.mockResolvedValue({});
      mockPrisma.client.update.mockResolvedValue(primary);
      mockPrisma.client.delete.mockResolvedValue(secondary);

      await service.mergeClients('pm1', 'pm2');

      expect(mockPrisma.mandataire.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { clientMoraleId: 'pm1' },
      });
    });

    it('should delete duplicate mandataires during merge', async () => {
      const primary = { id: 'pm1', clientType: 'MORALE', clientNumber: 'CLI-001', raisonSociale: 'A', accounts: [] };
      const secondary = { id: 'pm2', clientType: 'MORALE', clientNumber: 'CLI-002', raisonSociale: 'B', accounts: [] };

      mockPrisma.client.findUnique
        .mockResolvedValueOnce(primary)
        .mockResolvedValueOnce(secondary)
        .mockResolvedValueOnce(primary);

      mockPrisma.account.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.credit.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.savingsAccount.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.mandataire.findMany.mockResolvedValue([{ id: 'm1', clientPhysiqueId: 'pp-1' }]);
      mockPrisma.mandataire.findUnique.mockResolvedValue({ id: 'existing' }); // already linked
      mockPrisma.mandataire.delete.mockResolvedValue({});
      mockPrisma.client.update.mockResolvedValue(primary);
      mockPrisma.client.delete.mockResolvedValue(secondary);

      await service.mergeClients('pm1', 'pm2');

      expect(mockPrisma.mandataire.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });

  // ==================== ACTIVATE MOBILE ACCESS ====================

  describe('activateMobileAccess', () => {
    it('should generate password and send credentials', async () => {
      const client = {
        id: 'c1',
        clientType: 'PHYSIQUE',
        firstName: 'Jean',
        lastName: 'Kamga',
        phone: '+237690000000',
        clientNumber: 'CLI-001',
      };
      mockPrisma.client.findUnique.mockResolvedValue(client);
      mockPrisma.client.update.mockResolvedValue(client);

      const result = await service.activateMobileAccess('c1');

      expect(result.success).toBe(true);
      expect(result.clientNumber).toBe('CLI-001');
      expect(result.phone).toBe('+237690000000');
      expect(result.password).toBeDefined();
      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: { password: 'hashed-password' },
        }),
      );
    });

    it('should throw NotFoundException if client not found', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.activateMobileAccess('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should use raisonSociale for MORALE clients', async () => {
      const client = {
        id: 'c1',
        clientType: 'MORALE',
        raisonSociale: 'SARL Test',
        phone: '+237690000000',
        clientNumber: 'CLI-001',
      };
      mockPrisma.client.findUnique.mockResolvedValue(client);
      mockPrisma.client.update.mockResolvedValue(client);

      await service.activateMobileAccess('c1');

      expect(mockSmsService.sendCredentials).toHaveBeenCalledWith(
        '+237690000000',
        'SARL Test',
        'CLI-001',
        expect.any(String),
      );
    });
  });
});
