import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CompaniesService', () => {
  let service: CompaniesService;

  const mockPrisma = {
    company: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    salaryBatch: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    salaryPayment: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
    account: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── CREATE ──────────────────────────────────────────────────────────────

  describe('create', () => {
    const createData = {
      name: 'Societe ABC',
      registrationNumber: 'RC-2024-001',
      address: '10 Blvd de la Liberte',
      city: 'Douala',
      phone: '+237690000000',
      contactPerson: 'Jean Kamga',
    };

    it('should create a company successfully', async () => {
      mockPrisma.company.findUnique.mockResolvedValue(null);
      const created = { id: 'company-1', ...createData };
      mockPrisma.company.create.mockResolvedValue(created);

      const result = await service.create(createData);

      expect(mockPrisma.company.findUnique).toHaveBeenCalledWith({
        where: { registrationNumber: createData.registrationNumber },
      });
      expect(mockPrisma.company.create).toHaveBeenCalledWith({ data: createData });
      expect(result).toEqual(created);
    });

    it('should throw ConflictException when registration number already exists', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createData)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.company.create).not.toHaveBeenCalled();
    });
  });

  // ─── FIND ALL ────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all companies with counts', async () => {
      const companies = [{ id: '1', name: 'ABC', _count: { employees: 5, salaryBatches: 2 } }];
      mockPrisma.company.findMany.mockResolvedValue(companies);

      const result = await service.findAll();

      expect(mockPrisma.company.findMany).toHaveBeenCalledWith({
        include: {
          _count: { select: { employees: true, salaryBatches: true } },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(companies);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a company by id with employees and salary batches', async () => {
      const company = { id: 'company-1', name: 'ABC', employees: [], salaryBatches: [] };
      mockPrisma.company.findUnique.mockResolvedValue(company);

      const result = await service.findOne('company-1');

      expect(mockPrisma.company.findUnique).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        include: {
          employees: { include: { accounts: true } },
          salaryBatches: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });
      expect(result).toEqual(company);
    });

    it('should throw NotFoundException when company not found', async () => {
      mockPrisma.company.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── GET EMPLOYEES ──────────────────────────────────────────────────────

  describe('getEmployees', () => {
    it('should return employees of a company', async () => {
      const employees = [
        { id: 'c1', lastName: 'Dupont', companyId: 'company-1', accounts: [] },
      ];
      mockPrisma.client.findMany.mockResolvedValue(employees);

      const result = await service.getEmployees('company-1');

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
        include: { accounts: true },
        orderBy: { lastName: 'asc' },
      });
      expect(result).toEqual(employees);
    });
  });

  // ─── ADD EMPLOYEE ────────────────────────────────────────────────────────

  describe('addEmployee', () => {
    it('should throw NotFoundException when company does not exist', async () => {
      mockPrisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.addEmployee('non-existent', { clientId: 'c1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should add employee by clientId', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({ id: 'company-1' });
      const client = { id: 'c1', companyId: null };
      mockPrisma.client.findUnique.mockResolvedValue(client);
      const updatedClient = { ...client, companyId: 'company-1', accounts: [] };
      mockPrisma.client.update.mockResolvedValue(updatedClient);

      const result = await service.addEmployee('company-1', { clientId: 'c1' });

      expect(mockPrisma.client.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { companyId: 'company-1' },
        include: { accounts: true },
      });
      expect(result).toEqual(updatedClient);
    });

    it('should add employee by phone', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({ id: 'company-1' });
      const client = { id: 'c2', companyId: null };
      mockPrisma.client.findFirst.mockResolvedValue(client);
      mockPrisma.client.update.mockResolvedValue({ ...client, companyId: 'company-1', accounts: [] });

      await service.addEmployee('company-1', { phone: '+237690000000' });

      expect(mockPrisma.client.findFirst).toHaveBeenCalledWith({
        where: { phone: '+237690000000' },
      });
    });

    it('should throw NotFoundException when client not found', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({ id: 'company-1' });
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.addEmployee('company-1', { clientId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when client already belongs to a company', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({ id: 'company-1' });
      mockPrisma.client.findUnique.mockResolvedValue({ id: 'c1', companyId: 'other-company' });

      await expect(
        service.addEmployee('company-1', { clientId: 'c1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── REMOVE EMPLOYEE ────────────────────────────────────────────────────

  describe('removeEmployee', () => {
    it('should remove employee from company', async () => {
      const client = { id: 'c1', companyId: 'company-1' };
      mockPrisma.client.findUnique.mockResolvedValue(client);
      mockPrisma.client.update.mockResolvedValue({ ...client, companyId: null });

      const result = await service.removeEmployee('company-1', 'c1');

      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { companyId: null },
      });
    });

    it('should throw NotFoundException when client not found', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.removeEmployee('company-1', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when client does not belong to the company', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        id: 'c1',
        companyId: 'other-company',
      });

      await expect(
        service.removeEmployee('company-1', 'c1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── PROCESS SALARY BATCH ──────────────────────────────────────────────

  describe('processSalaryBatch', () => {
    it('should throw NotFoundException when company does not exist', async () => {
      mockPrisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.processSalaryBatch({
          companyId: 'non-existent',
          payments: [{ employeeName: 'Jean', employeePhone: '+237690000000', amount: 100000 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when company is inactive', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        isActive: false,
        employees: [],
        salaryBatches: [],
      });

      await expect(
        service.processSalaryBatch({
          companyId: 'company-1',
          payments: [{ employeeName: 'Jean', employeePhone: '+237690000000', amount: 100000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should process salary batch for active company', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        isActive: true,
        employees: [],
        salaryBatches: [],
      });
      const batchResult = { id: 'batch-1', status: 'COMPLETED', payments: [] };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.salaryBatch.create.mockResolvedValue({ id: 'batch-1' });
      mockPrisma.salaryPayment.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.salaryBatch.update.mockResolvedValue({});
      mockPrisma.salaryBatch.findUnique.mockResolvedValue(batchResult);

      const result = await service.processSalaryBatch({
        companyId: 'company-1',
        payments: [{ employeeName: 'Jean', employeePhone: '+237690000000', amount: 100000 }],
      });

      expect(result).toEqual(batchResult);
    });
  });

  // ─── GET SALARY HISTORY ────────────────────────────────────────────────

  describe('getSalaryHistory', () => {
    it('should return salary history for a company', async () => {
      const history = [{ id: 'batch-1', companyId: 'company-1', payments: [] }];
      mockPrisma.salaryBatch.findMany.mockResolvedValue(history);

      const result = await service.getSalaryHistory('company-1');

      expect(mockPrisma.salaryBatch.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
        include: { payments: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(history);
    });
  });
});
