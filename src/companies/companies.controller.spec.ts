import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CompaniesController', () => {
  let controller: CompaniesController;
  let service: CompaniesService;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getEmployees: jest.fn(),
    addEmployee: jest.fn(),
    removeEmployee: jest.fn(),
    processSalaryBatch: jest.fn(),
    getSalaryHistory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [
        { provide: CompaniesService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
        Reflector,
      ],
    }).compile();

    controller = module.get<CompaniesController>(CompaniesController);
    service = module.get<CompaniesService>(CompaniesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate to companiesService.create', async () => {
      const body = {
        name: 'ABC Corp',
        registrationNumber: 'RC-001',
        address: '10 Blvd',
        city: 'Douala',
        phone: '+237690000000',
        contactPerson: 'Jean',
      };
      const expected = { id: '1', ...body };
      mockService.create.mockResolvedValue(expected);

      const result = await controller.create(body);

      expect(mockService.create).toHaveBeenCalledWith(body);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should delegate to companiesService.findAll', async () => {
      const companies = [{ id: '1' }];
      mockService.findAll.mockResolvedValue(companies);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalled();
      expect(result).toEqual(companies);
    });
  });

  describe('findOne', () => {
    it('should delegate to companiesService.findOne with id', async () => {
      const company = { id: 'c1', name: 'ABC' };
      mockService.findOne.mockResolvedValue(company);

      const result = await controller.findOne('c1');

      expect(mockService.findOne).toHaveBeenCalledWith('c1');
      expect(result).toEqual(company);
    });
  });

  describe('getEmployees', () => {
    it('should delegate to companiesService.getEmployees with company id', async () => {
      const employees = [{ id: 'e1' }];
      mockService.getEmployees.mockResolvedValue(employees);

      const result = await controller.getEmployees('c1');

      expect(mockService.getEmployees).toHaveBeenCalledWith('c1');
      expect(result).toEqual(employees);
    });
  });

  describe('addEmployee', () => {
    it('should delegate to companiesService.addEmployee with companyId and body', async () => {
      const body = { clientId: 'client-1' };
      const expected = { id: 'client-1', companyId: 'c1' };
      mockService.addEmployee.mockResolvedValue(expected);

      const result = await controller.addEmployee('c1', body);

      expect(mockService.addEmployee).toHaveBeenCalledWith('c1', body);
      expect(result).toEqual(expected);
    });
  });

  describe('removeEmployee', () => {
    it('should delegate to companiesService.removeEmployee with companyId and clientId', async () => {
      const expected = { id: 'client-1', companyId: null };
      mockService.removeEmployee.mockResolvedValue(expected);

      const result = await controller.removeEmployee('c1', 'client-1');

      expect(mockService.removeEmployee).toHaveBeenCalledWith('c1', 'client-1');
      expect(result).toEqual(expected);
    });
  });

  describe('processSalaryBatch', () => {
    it('should delegate to companiesService.processSalaryBatch with companyId and payments', async () => {
      const body = {
        payments: [{ employeeName: 'Jean', employeePhone: '+237690000000', amount: 100000 }],
      };
      const expected = { id: 'batch-1', status: 'COMPLETED' };
      mockService.processSalaryBatch.mockResolvedValue(expected);

      const result = await controller.processSalaryBatch('c1', body);

      expect(mockService.processSalaryBatch).toHaveBeenCalledWith({
        companyId: 'c1',
        payments: body.payments,
      });
      expect(result).toEqual(expected);
    });
  });

  describe('getSalaryHistory', () => {
    it('should delegate to companiesService.getSalaryHistory with company id', async () => {
      const history = [{ id: 'batch-1' }];
      mockService.getSalaryHistory.mockResolvedValue(history);

      const result = await controller.getSalaryHistory('c1');

      expect(mockService.getSalaryHistory).toHaveBeenCalledWith('c1');
      expect(result).toEqual(history);
    });
  });
});
