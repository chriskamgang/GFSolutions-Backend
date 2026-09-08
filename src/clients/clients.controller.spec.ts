import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid'),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
}));

describe('ClientsController', () => {
  let controller: ClientsController;
  let clientsService: ClientsService;

  const mockClientsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    verifyKyc: jest.fn(),
    checkDuplicate: jest.fn(),
    getExpiredDocuments: jest.fn(),
    exportAll: jest.fn(),
    getClientsWithGps: jest.fn(),
    updateGps: jest.fn(),
    recalculateKycScore: jest.fn(),
    activateMobileAccess: jest.fn(),
    importClients: jest.fn(),
    mergeClients: jest.fn(),
    addMandataire: jest.fn(),
    getMandataires: jest.fn(),
    updateMandataire: jest.fn(),
    removeMandataire: jest.fn(),
  };

  const mockImportService = {
    importClients: jest.fn(),
    importAccounts: jest.fn(),
    generateTemplate: jest.fn(),
  };

  const mockPrismaService = {
    rolePermission: { findMany: jest.fn() },
  };

  const mockUser = { sub: 'user-1', agencyId: 'agency-1' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        { provide: ClientsService, useValue: mockClientsService },
        { provide: ImportService, useValue: mockImportService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
    clientsService = module.get<ClientsService>(ClientsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== CREATE ====================

  describe('create', () => {
    const dto: any = {
      clientType: 'PHYSIQUE',
      phone: '+237690000000',
      firstName: 'Jean',
      lastName: 'Kamga',
      address: 'Rue 123',
      city: 'Douala',
      region: 'Littoral',
    };

    it('should create a client and pass userId', async () => {
      mockClientsService.create.mockResolvedValue({ id: 'c1', ...dto });

      const result = await controller.create(dto, mockUser);

      expect(result.id).toBe('c1');
      expect(mockClientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ agencyId: 'agency-1' }),
        'user-1',
      );
    });

    it('should use user agencyId when not provided in dto', async () => {
      const dtoNoAgency = { ...dto };
      delete dtoNoAgency.agencyId;
      mockClientsService.create.mockResolvedValue({ id: 'c1' });

      await controller.create(dtoNoAgency, mockUser);

      expect(mockClientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ agencyId: 'agency-1' }),
        'user-1',
      );
    });

    it('should keep dto agencyId when provided', async () => {
      const dtoWithAgency = { ...dto, agencyId: 'custom-agency' };
      mockClientsService.create.mockResolvedValue({ id: 'c1' });

      await controller.create(dtoWithAgency, mockUser);

      expect(mockClientsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ agencyId: 'custom-agency' }),
        'user-1',
      );
    });
  });

  // ==================== FIND ALL ====================

  describe('findAll', () => {
    it('should return paginated clients with default pagination', async () => {
      const expected = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      mockClientsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(result).toEqual(expected);
      expect(mockClientsService.findAll).toHaveBeenCalledWith({
        agencyId: undefined,
        status: undefined,
        search: undefined,
        clientType: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('should pass query params and parse page/limit to integers', async () => {
      mockClientsService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll('ag-1', 'ACTIVE', 'Jean', 'PHYSIQUE', '2', '10');

      expect(mockClientsService.findAll).toHaveBeenCalledWith({
        agencyId: 'ag-1',
        status: 'ACTIVE',
        search: 'Jean',
        clientType: 'PHYSIQUE',
        page: 2,
        limit: 10,
      });
    });
  });

  // ==================== FIND ONE ====================

  describe('findOne', () => {
    it('should return a client by id', async () => {
      const client = { id: 'c1', firstName: 'Jean' };
      mockClientsService.findOne.mockResolvedValue(client);

      const result = await controller.findOne('c1');

      expect(result).toEqual(client);
      expect(mockClientsService.findOne).toHaveBeenCalledWith('c1');
    });
  });

  // ==================== UPDATE ====================

  describe('update', () => {
    it('should update a client', async () => {
      const dto: any = { firstName: 'Pierre' };
      mockClientsService.update.mockResolvedValue({ id: 'c1', firstName: 'Pierre' });

      const result = await controller.update('c1', dto, mockUser);

      expect(result.firstName).toBe('Pierre');
      expect(mockClientsService.update).toHaveBeenCalledWith('c1', dto, 'user-1');
    });
  });

  // ==================== UPDATE STATUS ====================

  describe('updateStatus', () => {
    it('should update client status', async () => {
      mockClientsService.updateStatus.mockResolvedValue({ id: 'c1', status: 'SUSPENDED' });

      const result = await controller.updateStatus('c1', 'SUSPENDED', mockUser);

      expect(result.status).toBe('SUSPENDED');
      expect(mockClientsService.updateStatus).toHaveBeenCalledWith('c1', 'SUSPENDED', 'user-1');
    });
  });

  // ==================== VERIFY KYC ====================

  describe('verifyKyc', () => {
    it('should verify KYC for a client', async () => {
      mockClientsService.verifyKyc.mockResolvedValue({ id: 'c1', kycVerified: true });

      const result = await controller.verifyKyc('c1', mockUser);

      expect(result.kycVerified).toBe(true);
      expect(mockClientsService.verifyKyc).toHaveBeenCalledWith('c1', 'user-1');
    });
  });

  // ==================== CHECK DUPLICATE ====================

  describe('checkDuplicate', () => {
    it('should delegate to service', async () => {
      const dto = { phone: '+237690000000' };
      mockClientsService.checkDuplicate.mockResolvedValue({ duplicates: [], hasDuplicates: false });

      const result = await controller.checkDuplicate(dto);

      expect(result.hasDuplicates).toBe(false);
      expect(mockClientsService.checkDuplicate).toHaveBeenCalledWith(dto);
    });
  });

  // ==================== DOCUMENT ALERTS ====================

  describe('getDocumentAlerts', () => {
    it('should return expired documents and KYC alerts', async () => {
      const alerts = {
        expired: { count: 1, clients: [{ id: 'c1' }] },
        expiringSoon: { count: 0, clients: [] },
        kycIncomplete: { count: 2, clients: [{ id: 'c2' }, { id: 'c3' }] },
      };
      mockClientsService.getExpiredDocuments.mockResolvedValue(alerts);

      const result = await controller.getDocumentAlerts();

      expect(result).toEqual(alerts);
    });
  });

  // ==================== EXPORT ====================

  describe('export', () => {
    it('should delegate to exportAll with filters', async () => {
      mockClientsService.exportAll.mockResolvedValue([{ id: 'c1' }]);

      const result = await controller.export('ACTIVE', 'ag-1', 'PHYSIQUE');

      expect(mockClientsService.exportAll).toHaveBeenCalledWith({
        status: 'ACTIVE',
        agencyId: 'ag-1',
        clientType: 'PHYSIQUE',
      });
    });
  });

  // ==================== GPS ====================

  describe('getClientsWithGps', () => {
    it('should return clients with GPS coordinates', async () => {
      mockClientsService.getClientsWithGps.mockResolvedValue([{ id: 'c1', gpsLatitude: 4.05, gpsLongitude: 9.7 }]);

      const result = await controller.getClientsWithGps('ag-1');

      expect(mockClientsService.getClientsWithGps).toHaveBeenCalledWith('ag-1');
    });
  });

  describe('updateGps', () => {
    it('should update GPS coordinates', async () => {
      const gps = { latitude: 4.05, longitude: 9.7, accuracy: 'precise' };
      mockClientsService.updateGps.mockResolvedValue({ gpsLatitude: 4.05, gpsLongitude: 9.7, gpsAccuracy: 'precise' });

      const result = await controller.updateGps('c1', gps, mockUser);

      expect(mockClientsService.updateGps).toHaveBeenCalledWith('c1', gps, 'user-1');
    });
  });

  // ==================== KYC SCORE ====================

  describe('calculateKycScore', () => {
    it('should recalculate KYC score for a client', async () => {
      mockClientsService.recalculateKycScore.mockResolvedValue({ score: 75, label: 'Bon', details: {} });

      const result = await controller.calculateKycScore('c1');

      expect(result.score).toBe(75);
      expect(mockClientsService.recalculateKycScore).toHaveBeenCalledWith('c1');
    });
  });

  // ==================== ACTIVATE MOBILE ====================

  describe('activateMobileAccess', () => {
    it('should activate mobile access', async () => {
      mockClientsService.activateMobileAccess.mockResolvedValue({
        success: true,
        clientNumber: 'CLI-001',
        phone: '+237690000000',
        password: 'abc123',
      });

      const result = await controller.activateMobileAccess('c1');

      expect(result.success).toBe(true);
      expect(mockClientsService.activateMobileAccess).toHaveBeenCalledWith('c1');
    });
  });

  // ==================== MERGE ====================

  describe('mergeClients', () => {
    it('should merge two clients', async () => {
      mockClientsService.mergeClients.mockResolvedValue({ id: 'c1' });

      const result = await controller.mergeClients(
        { primaryId: 'c1', secondaryId: 'c2' },
        mockUser,
      );

      expect(mockClientsService.mergeClients).toHaveBeenCalledWith('c1', 'c2', 'user-1');
    });
  });

  // ==================== IMPORT CSV ====================

  describe('importClients (CSV)', () => {
    it('should throw BadRequestException when no file provided', async () => {
      await expect(controller.importClients(undefined, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for file with only header', async () => {
      const file = { buffer: Buffer.from('phone,firstName,lastName') };

      await expect(controller.importClients(file, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should parse CSV and delegate to service', async () => {
      const csvContent = 'phone,firstName,lastName\n+237690000000,Jean,Kamga';
      const file = { buffer: Buffer.from(csvContent) };
      mockClientsService.importClients.mockResolvedValue({ success: 1, errors: [] });

      const result = await controller.importClients(file, mockUser);

      expect(result.success).toBe(1);
      expect(mockClientsService.importClients).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            phone: '+237690000000',
            firstName: 'Jean',
            lastName: 'Kamga',
          }),
        ]),
        'user-1',
      );
    });

    it('should handle semicolon-separated CSV', async () => {
      const csvContent = 'phone;firstName;lastName\n+237690000000;Jean;Kamga';
      const file = { buffer: Buffer.from(csvContent) };
      mockClientsService.importClients.mockResolvedValue({ success: 1, errors: [] });

      await controller.importClients(file, mockUser);

      expect(mockClientsService.importClients).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ phone: '+237690000000' }),
        ]),
        'user-1',
      );
    });
  });

  // ==================== MANDATAIRES ====================

  describe('addMandataire', () => {
    it('should add a mandataire to a morale client', async () => {
      const dto: any = { clientPhysiqueId: 'pp-1', role: 'GERANT', isSignataire: true };
      mockClientsService.addMandataire.mockResolvedValue({ id: 'm1', ...dto });

      const result = await controller.addMandataire('pm-1', dto, mockUser);

      expect(result.id).toBe('m1');
      expect(mockClientsService.addMandataire).toHaveBeenCalledWith('pm-1', dto, 'user-1');
    });
  });

  describe('getMandataires', () => {
    it('should return mandataires for a morale client', async () => {
      mockClientsService.getMandataires.mockResolvedValue([{ id: 'm1' }]);

      const result = await controller.getMandataires('pm-1');

      expect(result).toHaveLength(1);
      expect(mockClientsService.getMandataires).toHaveBeenCalledWith('pm-1');
    });
  });

  describe('updateMandataire', () => {
    it('should update a mandataire', async () => {
      const dto: any = { role: 'DG' };
      mockClientsService.updateMandataire.mockResolvedValue({ id: 'm1', role: 'DG' });

      const result = await controller.updateMandataire('m1', dto, mockUser);

      expect(result.role).toBe('DG');
      expect(mockClientsService.updateMandataire).toHaveBeenCalledWith('m1', dto, 'user-1');
    });
  });

  describe('removeMandataire', () => {
    it('should remove a mandataire', async () => {
      mockClientsService.removeMandataire.mockResolvedValue({ id: 'm1' });

      const result = await controller.removeMandataire('m1', mockUser);

      expect(result.id).toBe('m1');
      expect(mockClientsService.removeMandataire).toHaveBeenCalledWith('m1', 'user-1');
    });
  });

  // ==================== IMPORT EXCEL ====================

  describe('importClientsExcel', () => {
    it('should throw BadRequestException when no file', () => {
      expect(() => controller.importClientsExcel(undefined, 'ag-1', mockUser)).toThrow(BadRequestException);
    });

    it('should delegate to importService', () => {
      const file = { buffer: Buffer.from('data') };
      mockImportService.importClients.mockResolvedValue({ success: 1, errors: [] });

      controller.importClientsExcel(file, 'ag-1', mockUser);

      expect(mockImportService.importClients).toHaveBeenCalledWith(file.buffer, 'ag-1');
    });

    it('should use user agencyId when not provided', () => {
      const file = { buffer: Buffer.from('data') };
      mockImportService.importClients.mockResolvedValue({ success: 1, errors: [] });

      controller.importClientsExcel(file, '', mockUser);

      expect(mockImportService.importClients).toHaveBeenCalledWith(file.buffer, 'agency-1');
    });
  });

  describe('importAccountsExcel', () => {
    it('should throw BadRequestException when no file', () => {
      expect(() => controller.importAccountsExcel(undefined, 'ag-1', mockUser)).toThrow(BadRequestException);
    });

    it('should delegate to importService', () => {
      const file = { buffer: Buffer.from('data') };
      mockImportService.importAccounts.mockResolvedValue({ success: 1, errors: [] });

      controller.importAccountsExcel(file, 'ag-1', mockUser);

      expect(mockImportService.importAccounts).toHaveBeenCalledWith(file.buffer, 'ag-1');
    });
  });

  describe('getImportTemplate', () => {
    it('should return clients template', () => {
      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      mockImportService.generateTemplate.mockReturnValue(Buffer.from('xlsx'));

      controller.getImportTemplate('clients', mockRes);

      expect(mockImportService.generateTemplate).toHaveBeenCalledWith('clients');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('spreadsheetml'));
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should default to clients for invalid type', () => {
      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      mockImportService.generateTemplate.mockReturnValue(Buffer.from('xlsx'));

      controller.getImportTemplate('invalid', mockRes);

      expect(mockImportService.generateTemplate).toHaveBeenCalledWith('clients');
    });

    it('should return accounts template', () => {
      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      mockImportService.generateTemplate.mockReturnValue(Buffer.from('xlsx'));

      controller.getImportTemplate('accounts', mockRes);

      expect(mockImportService.generateTemplate).toHaveBeenCalledWith('accounts');
    });
  });
});
