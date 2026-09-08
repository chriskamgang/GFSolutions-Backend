import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AgenciesController } from './agencies.controller';
import { AgenciesService } from './agencies.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AgenciesController', () => {
  let controller: AgenciesController;
  let service: AgenciesService;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    getConsolidatedView: jest.fn(),
    getGlobalSettings: jest.fn(),
    interAgencyTransfer: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgenciesController],
      providers: [
        { provide: AgenciesService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
        Reflector,
      ],
    }).compile();

    controller = module.get<AgenciesController>(AgenciesController);
    service = module.get<AgenciesService>(AgenciesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate to agenciesService.create with the body', async () => {
      const body = {
        name: 'Agence Douala',
        code: 'DLA-001',
        address: '123 Rue',
        city: 'Douala',
        region: 'Littoral',
        phone: '+237690000001',
      };
      const expected = { id: '1', ...body };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(body);

      expect(mockService.create).toHaveBeenCalledWith(body);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should delegate to agenciesService.findAll', async () => {
      const agencies = [{ id: '1' }, { id: '2' }];
      mockService.findAll.mockResolvedValue(agencies);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalled();
      expect(result).toEqual(agencies);
    });
  });

  describe('getConsolidatedView', () => {
    it('should delegate to agenciesService.getConsolidatedView', async () => {
      const consolidated = { agencies: [], consolide: {} };
      mockService.getConsolidatedView.mockResolvedValue(consolidated);

      const result = await controller.getConsolidatedView();

      expect(mockService.getConsolidatedView).toHaveBeenCalled();
      expect(result).toEqual(consolidated);
    });
  });

  describe('getGlobalSettings', () => {
    it('should delegate to agenciesService.getGlobalSettings', async () => {
      const settings = { feeConfigs: [], agencies: [] };
      mockService.getGlobalSettings.mockResolvedValue(settings);

      const result = await controller.getGlobalSettings();

      expect(mockService.getGlobalSettings).toHaveBeenCalled();
      expect(result).toEqual(settings);
    });
  });

  describe('findOne', () => {
    it('should delegate to agenciesService.findOne with the id', async () => {
      const agency = { id: 'agency-1', name: 'Agence Douala' };
      mockService.findOne.mockResolvedValue(agency);

      const result = await controller.findOne('agency-1');

      expect(mockService.findOne).toHaveBeenCalledWith('agency-1');
      expect(result).toEqual(agency);
    });
  });

  describe('update', () => {
    it('should delegate to agenciesService.update with id and body', async () => {
      const body = { name: 'Updated' };
      const updated = { id: 'agency-1', name: 'Updated' };
      mockService.update.mockResolvedValue(updated);

      const result = await controller.update('agency-1', body);

      expect(mockService.update).toHaveBeenCalledWith('agency-1', body);
      expect(result).toEqual(updated);
    });
  });

  describe('interAgencyTransfer', () => {
    it('should delegate to agenciesService.interAgencyTransfer with body and user.sub', async () => {
      const body = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100000,
      };
      const user = { sub: 'user-1' };
      const expected = { message: 'Transfert inter-agence effectue' };
      mockService.interAgencyTransfer.mockResolvedValue(expected);

      const result = await controller.interAgencyTransfer(body, user);

      expect(mockService.interAgencyTransfer).toHaveBeenCalledWith(body, 'user-1');
      expect(result).toEqual(expected);
    });
  });
});
