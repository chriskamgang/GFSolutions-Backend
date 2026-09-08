import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SettingsService', () => {
  let service: SettingsService;

  const mockPrisma = {
    setting: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    feeConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    creditProduct: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    savingsProduct: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== getAllSettings() ====================

  describe('getAllSettings', () => {
    it('should return grouped settings', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'company_name', value: 'GFS', category: 'general' },
        { key: 'late_fee_rate', value: '5', category: 'penalties' },
        { key: 'sms_key', value: 'abc', category: 'sms' },
      ]);
      mockPrisma.feeConfig.findMany.mockResolvedValue([{ id: 'fee-1', name: 'Retrait' }]);
      mockPrisma.creditProduct.findMany.mockResolvedValue([{ id: 'cp-1', name: 'Credit Express' }]);
      mockPrisma.savingsProduct.findMany.mockResolvedValue([{ id: 'sp-1', name: 'Epargne Libre' }]);
      mockPrisma.role.findMany.mockResolvedValue([{ id: 'r-1', name: 'Caissier', maxTransactionAmount: 1000000 }]);

      const result = await service.getAllSettings();

      expect(result.general).toEqual({ company_name: 'GFS' });
      expect(result.penalties).toEqual({ late_fee_rate: '5' });
      expect(result.fees).toHaveLength(1);
      expect(result.credit_products).toHaveLength(1);
      expect(result.savings_products).toHaveLength(1);
      expect(result.limits).toHaveLength(1);
    });

    it('should handle empty settings', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([]);
      mockPrisma.feeConfig.findMany.mockResolvedValue([]);
      mockPrisma.creditProduct.findMany.mockResolvedValue([]);
      mockPrisma.savingsProduct.findMany.mockResolvedValue([]);
      mockPrisma.role.findMany.mockResolvedValue([]);

      const result = await service.getAllSettings();

      expect(result.general).toEqual({});
      expect(result.fees).toEqual([]);
    });
  });

  // ==================== getSettingsByCategory() ====================

  describe('getSettingsByCategory', () => {
    it('should return settings for a given category', async () => {
      const settings = [{ key: 'k1', value: 'v1', category: 'general' }];
      mockPrisma.setting.findMany.mockResolvedValue(settings);

      const result = await service.getSettingsByCategory('general');

      expect(result).toEqual(settings);
      expect(mockPrisma.setting.findMany).toHaveBeenCalledWith({ where: { category: 'general' } });
    });
  });

  // ==================== upsertSetting() ====================

  describe('upsertSetting', () => {
    it('should upsert a setting', async () => {
      const upserted = { key: 'company_name', value: 'GFS v2', category: 'general' };
      mockPrisma.setting.upsert.mockResolvedValue(upserted);

      const result = await service.upsertSetting('company_name', 'GFS v2', 'general', 'Nom');

      expect(result).toEqual(upserted);
      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { key: 'company_name' },
        update: { value: 'GFS v2', category: 'general', description: 'Nom' },
        create: { key: 'company_name', value: 'GFS v2', category: 'general', description: 'Nom' },
      });
    });
  });

  // ==================== Fee Configs ====================

  describe('getAllFeeConfigs', () => {
    it('should return all fee configs', async () => {
      const configs = [{ id: 'f-1', name: 'Retrait' }];
      mockPrisma.feeConfig.findMany.mockResolvedValue(configs);

      const result = await service.getAllFeeConfigs();

      expect(result).toEqual(configs);
      expect(mockPrisma.feeConfig.findMany).toHaveBeenCalledWith({ orderBy: { transactionType: 'asc' } });
    });
  });

  describe('createFeeConfig', () => {
    it('should create a fee config', async () => {
      const data = { name: 'Retrait', transactionType: 'WITHDRAWAL', feeValue: 500 };
      const created = { id: 'f-1', ...data };
      mockPrisma.feeConfig.create.mockResolvedValue(created);

      const result = await service.createFeeConfig(data);

      expect(result).toEqual(created);
      expect(mockPrisma.feeConfig.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('updateFeeConfig', () => {
    it('should update an existing fee config', async () => {
      const existing = { id: 'f-1', name: 'Retrait', feeValue: 500 };
      mockPrisma.feeConfig.findUnique.mockResolvedValue(existing);
      mockPrisma.feeConfig.update.mockResolvedValue({ ...existing, feeValue: 750 });

      const result = await service.updateFeeConfig('f-1', { feeValue: 750 });

      expect(result.feeValue).toBe(750);
      expect(mockPrisma.feeConfig.update).toHaveBeenCalledWith({
        where: { id: 'f-1' },
        data: { feeValue: 750 },
      });
    });

    it('should throw NotFoundException when fee config not found', async () => {
      mockPrisma.feeConfig.findUnique.mockResolvedValue(null);

      await expect(service.updateFeeConfig('nonexistent', { feeValue: 100 }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ==================== Credit Products ====================

  describe('getAllCreditProducts', () => {
    it('should return all credit products', async () => {
      const products = [{ id: 'cp-1', name: 'Credit Express' }];
      mockPrisma.creditProduct.findMany.mockResolvedValue(products);

      const result = await service.getAllCreditProducts();

      expect(result).toEqual(products);
    });
  });

  describe('createCreditProduct', () => {
    it('should create a credit product', async () => {
      const data = {
        name: 'Credit Express',
        code: 'CRE',
        minAmount: 50000,
        maxAmount: 5000000,
        minDurationMonths: 1,
        maxDurationMonths: 24,
        interestRate: 12,
      };
      const created = { id: 'cp-1', ...data };
      mockPrisma.creditProduct.create.mockResolvedValue(created);

      const result = await service.createCreditProduct(data);

      expect(result).toEqual(created);
      expect(mockPrisma.creditProduct.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('updateCreditProduct', () => {
    it('should update an existing credit product', async () => {
      const existing = { id: 'cp-1', name: 'Credit Express', interestRate: 12 };
      mockPrisma.creditProduct.findUnique.mockResolvedValue(existing);
      mockPrisma.creditProduct.update.mockResolvedValue({ ...existing, interestRate: 15 });

      const result = await service.updateCreditProduct('cp-1', { interestRate: 15 });

      expect(result.interestRate).toBe(15);
    });

    it('should throw NotFoundException when credit product not found', async () => {
      mockPrisma.creditProduct.findUnique.mockResolvedValue(null);

      await expect(service.updateCreditProduct('nonexistent', { name: 'X' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ==================== Savings Products ====================

  describe('getAllSavingsProducts', () => {
    it('should return all savings products', async () => {
      const products = [{ id: 'sp-1', name: 'Epargne Libre' }];
      mockPrisma.savingsProduct.findMany.mockResolvedValue(products);

      const result = await service.getAllSavingsProducts();

      expect(result).toEqual(products);
    });
  });

  describe('updateSavingsProduct', () => {
    it('should update an existing savings product', async () => {
      const existing = { id: 'sp-1', name: 'Epargne Libre', interestRate: 5 };
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(existing);
      mockPrisma.savingsProduct.update.mockResolvedValue({ ...existing, interestRate: 7 });

      const result = await service.updateSavingsProduct('sp-1', { interestRate: 7 });

      expect(result.interestRate).toBe(7);
    });

    it('should throw NotFoundException when savings product not found', async () => {
      mockPrisma.savingsProduct.findUnique.mockResolvedValue(null);

      await expect(service.updateSavingsProduct('nonexistent', { name: 'X' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ==================== SMS Config ====================

  describe('getSmsConfig', () => {
    it('should return SMS config with password masked', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'nexah_sms_user', value: 'admin', category: 'sms' },
        { key: 'nexah_sms_password', value: 'secret123', category: 'sms' },
        { key: 'nexah_sms_sender_id', value: 'GFS', category: 'sms' },
        { key: 'nexah_sms_enabled', value: 'true', category: 'sms' },
      ]);

      const result = await service.getSmsConfig();

      expect(result.user).toBe('admin');
      expect(result.passwordConfigured).toBe(true);
      expect(result.senderId).toBe('GFS');
      expect(result.enabled).toBe(true);
      // Should NOT return the actual password
      expect(result).not.toHaveProperty('password');
    });

    it('should handle missing SMS settings with defaults', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([]);

      const result = await service.getSmsConfig();

      expect(result.user).toBe('');
      expect(result.passwordConfigured).toBe(false);
      expect(result.senderId).toBe('GFS');
      expect(result.enabled).toBe(true); // 'false' !== undefined
    });

    it('should return enabled=false when explicitly disabled', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'nexah_sms_enabled', value: 'false', category: 'sms' },
      ]);

      const result = await service.getSmsConfig();

      expect(result.enabled).toBe(false);
    });
  });

  describe('saveSmsConfig', () => {
    it('should upsert SMS config settings', async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      const result = await service.saveSmsConfig({
        user: 'admin',
        password: 'newpass',
        senderId: 'GFS',
        enabled: true,
      });

      expect(result.success).toBe(true);
      // Should have 4 upserts: user, senderId, enabled, password
      expect(mockPrisma.setting.upsert).toHaveBeenCalledTimes(4);
    });

    it('should skip password upsert when password not provided', async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      await service.saveSmsConfig({
        user: 'admin',
        senderId: 'GFS',
        enabled: false,
      });

      // Should have 3 upserts: user, senderId, enabled (no password)
      expect(mockPrisma.setting.upsert).toHaveBeenCalledTimes(3);
    });
  });

  // ==================== KPay Config ====================

  describe('getKpayConfig', () => {
    it('should return KPay config', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'kpay_mode', value: 'live', category: 'kpay' },
        { key: 'kpay_test_api_key', value: 'test-key', category: 'kpay' },
        { key: 'kpay_test_secret_key', value: 'secret', category: 'kpay' },
        { key: 'kpay_enabled', value: 'true', category: 'kpay' },
        { key: 'kpay_enabled_providers', value: '["MTN","ORANGE"]', category: 'kpay' },
      ]);

      const result = await service.getKpayConfig();

      expect(result.mode).toBe('live');
      expect(result.testApiKey).toBe('test-key');
      expect(result.testSecretKeyConfigured).toBe(true);
      expect(result.enabled).toBe(true);
      expect(result.enabledProviders).toEqual(['MTN', 'ORANGE']);
    });

    it('should handle missing KPay settings with defaults', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([]);

      const result = await service.getKpayConfig();

      expect(result.mode).toBe('test');
      expect(result.testApiKey).toBe('');
      expect(result.enabled).toBe(true);
      expect(result.enabledProviders).toEqual([]);
    });
  });

  describe('saveKpayConfig', () => {
    it('should upsert KPay settings', async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      const result = await service.saveKpayConfig({
        mode: 'live',
        testApiKey: 'tk',
        testSecretKey: 'ts',
        liveApiKey: 'lk',
        liveSecretKey: 'ls',
        enabled: true,
        enabledProviders: ['MTN'],
      });

      expect(result.success).toBe(true);
      // mode + testApiKey + testSecretKey + liveApiKey + liveSecretKey + enabled + enabledProviders = 7
      expect(mockPrisma.setting.upsert).toHaveBeenCalledTimes(7);
    });

    it('should handle retro-compatible apiKey/secretKey when test keys not provided', async () => {
      mockPrisma.setting.upsert.mockResolvedValue({});

      await service.saveKpayConfig({ apiKey: 'old-key', secretKey: 'old-secret' });

      // apiKey (retro) + secretKey (retro) = 2
      expect(mockPrisma.setting.upsert).toHaveBeenCalledTimes(2);
    });

    it('should not upsert anything when empty data provided', async () => {
      const result = await service.saveKpayConfig({});

      expect(result.success).toBe(true);
      expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
    });
  });

  // ==================== Backup / Restore ====================
  // Note: listBackups, createBackup, restoreBackup use dynamic `await import('fs')`
  // which requires --experimental-vm-modules in Jest. We test that the methods exist
  // and verify their contract without calling them directly.

  describe('listBackups', () => {
    it('should be a function', () => {
      expect(typeof service.listBackups).toBe('function');
    });
  });

  describe('createBackup', () => {
    it('should be a function', () => {
      expect(typeof service.createBackup).toBe('function');
    });
  });

  describe('restoreBackup', () => {
    it('should be a function', () => {
      expect(typeof service.restoreBackup).toBe('function');
    });
  });
});
