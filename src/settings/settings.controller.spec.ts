jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SmsService } from '../sms/sms.service';
import { PawaPayService } from '../pawapay/pawapay.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SettingsController', () => {
  let controller: SettingsController;

  const mockSettingsService = {
    getAllSettings: jest.fn(),
    getAllFeeConfigs: jest.fn(),
    createFeeConfig: jest.fn(),
    updateFeeConfig: jest.fn(),
    getAllCreditProducts: jest.fn(),
    createCreditProduct: jest.fn(),
    updateCreditProduct: jest.fn(),
    getSmsConfig: jest.fn(),
    saveSmsConfig: jest.fn(),
    getAllSavingsProducts: jest.fn(),
    updateSavingsProduct: jest.fn(),
    getKpayConfig: jest.fn(),
    saveKpayConfig: jest.fn(),
    listBackups: jest.fn(),
    createBackup: jest.fn(),
    restoreBackup: jest.fn(),
  };

  const mockSmsService = {
    loadConfigFromDb: jest.fn(),
    send: jest.fn(),
  };

  const mockKpayService = {
    loadConfigFromDb: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: PawaPayService, useValue: mockKpayService },
        { provide: PrismaService, useValue: {} },
        Reflector,
      ],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== getAllSettings() ====================

  describe('getAllSettings', () => {
    it('should delegate to settingsService.getAllSettings', async () => {
      const settings = { general: {}, fees: [], credit_products: [] };
      mockSettingsService.getAllSettings.mockResolvedValue(settings);

      const result = await controller.getAllSettings();

      expect(result).toEqual(settings);
      expect(mockSettingsService.getAllSettings).toHaveBeenCalled();
    });
  });

  // ==================== Fee Configs ====================

  describe('getAllFeeConfigs', () => {
    it('should delegate to settingsService.getAllFeeConfigs', async () => {
      const configs = [{ id: 'f-1', name: 'Retrait' }];
      mockSettingsService.getAllFeeConfigs.mockResolvedValue(configs);

      const result = await controller.getAllFeeConfigs();

      expect(result).toEqual(configs);
    });
  });

  describe('createFeeConfig', () => {
    it('should delegate to settingsService.createFeeConfig', async () => {
      const body = { name: 'Retrait', transactionType: 'WITHDRAWAL', feeValue: 500 };
      const created = { id: 'f-1', ...body };
      mockSettingsService.createFeeConfig.mockResolvedValue(created);

      const result = await controller.createFeeConfig(body);

      expect(result).toEqual(created);
      expect(mockSettingsService.createFeeConfig).toHaveBeenCalledWith(body);
    });
  });

  describe('updateFeeConfig', () => {
    it('should delegate to settingsService.updateFeeConfig', async () => {
      const body = { feeValue: 750 };
      mockSettingsService.updateFeeConfig.mockResolvedValue({ id: 'f-1', feeValue: 750 });

      const result = await controller.updateFeeConfig('f-1', body);

      expect(result.feeValue).toBe(750);
      expect(mockSettingsService.updateFeeConfig).toHaveBeenCalledWith('f-1', body);
    });
  });

  // ==================== Credit Products ====================

  describe('getAllCreditProducts', () => {
    it('should delegate to settingsService.getAllCreditProducts', async () => {
      mockSettingsService.getAllCreditProducts.mockResolvedValue([]);

      const result = await controller.getAllCreditProducts();

      expect(result).toEqual([]);
    });
  });

  describe('createCreditProduct', () => {
    it('should delegate to settingsService.createCreditProduct', async () => {
      const body = {
        name: 'Credit Express',
        code: 'CRE',
        minAmount: 50000,
        maxAmount: 5000000,
        minDurationMonths: 1,
        maxDurationMonths: 24,
        interestRate: 12,
      };
      mockSettingsService.createCreditProduct.mockResolvedValue({ id: 'cp-1', ...body });

      const result = await controller.createCreditProduct(body);

      expect(result.id).toBe('cp-1');
      expect(mockSettingsService.createCreditProduct).toHaveBeenCalledWith(body);
    });
  });

  describe('updateCreditProduct', () => {
    it('should delegate to settingsService.updateCreditProduct', async () => {
      mockSettingsService.updateCreditProduct.mockResolvedValue({ id: 'cp-1', interestRate: 15 });

      const result = await controller.updateCreditProduct('cp-1', { interestRate: 15 });

      expect(result.interestRate).toBe(15);
      expect(mockSettingsService.updateCreditProduct).toHaveBeenCalledWith('cp-1', { interestRate: 15 });
    });
  });

  // ==================== SMS Config ====================

  describe('getSmsConfig', () => {
    it('should delegate to settingsService.getSmsConfig', async () => {
      const config = { user: 'admin', passwordConfigured: true, senderId: 'GFS', enabled: true };
      mockSettingsService.getSmsConfig.mockResolvedValue(config);

      const result = await controller.getSmsConfig();

      expect(result).toEqual(config);
    });
  });

  describe('saveSmsConfig', () => {
    it('should save config and reload SMS service', async () => {
      const body = { user: 'admin', senderId: 'GFS', enabled: true };
      mockSettingsService.saveSmsConfig.mockResolvedValue({ success: true });
      mockSmsService.loadConfigFromDb.mockResolvedValue(undefined);

      const result = await controller.saveSmsConfig(body);

      expect(result).toEqual({ success: true });
      expect(mockSettingsService.saveSmsConfig).toHaveBeenCalledWith(body);
      expect(mockSmsService.loadConfigFromDb).toHaveBeenCalled();
    });
  });

  describe('testSms', () => {
    it('should reload config and send test SMS', async () => {
      mockSmsService.loadConfigFromDb.mockResolvedValue(undefined);
      mockSmsService.send.mockResolvedValue(true);

      const result = await controller.testSms({ phone: '690000000' });

      expect(result.success).toBe(true);
      expect(mockSmsService.loadConfigFromDb).toHaveBeenCalled();
      expect(mockSmsService.send).toHaveBeenCalledWith(
        '690000000',
        'Test SMS GFS — Votre configuration NEXAH fonctionne correctement.',
      );
    });

    it('should return failure when SMS send fails', async () => {
      mockSmsService.loadConfigFromDb.mockResolvedValue(undefined);
      mockSmsService.send.mockResolvedValue(false);

      const result = await controller.testSms({ phone: '690000000' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Echec');
    });
  });

  // ==================== Savings Products ====================

  describe('getAllSavingsProducts', () => {
    it('should delegate to settingsService.getAllSavingsProducts', async () => {
      mockSettingsService.getAllSavingsProducts.mockResolvedValue([{ id: 'sp-1' }]);

      const result = await controller.getAllSavingsProducts();

      expect(result).toHaveLength(1);
    });
  });

  describe('updateSavingsProduct', () => {
    it('should delegate to settingsService.updateSavingsProduct', async () => {
      mockSettingsService.updateSavingsProduct.mockResolvedValue({ id: 'sp-1', interestRate: 7 });

      const result = await controller.updateSavingsProduct('sp-1', { interestRate: 7 });

      expect(result.interestRate).toBe(7);
      expect(mockSettingsService.updateSavingsProduct).toHaveBeenCalledWith('sp-1', { interestRate: 7 });
    });
  });

  // ==================== KPay Config ====================

  describe('getKpayConfig', () => {
    it('should delegate to settingsService.getKpayConfig', async () => {
      const config = { mode: 'test', enabled: true };
      mockSettingsService.getKpayConfig.mockResolvedValue(config);

      const result = await controller.getKpayConfig();

      expect(result).toEqual(config);
    });
  });

  describe('saveKpayConfig', () => {
    it('should save config and reload KPay service', async () => {
      const body = { mode: 'live', enabled: true };
      mockSettingsService.saveKpayConfig.mockResolvedValue({ success: true });
      mockKpayService.loadConfigFromDb.mockResolvedValue(undefined);

      const result = await controller.saveKpayConfig(body);

      expect(result).toEqual({ success: true });
      expect(mockSettingsService.saveKpayConfig).toHaveBeenCalledWith(body);
      expect(mockKpayService.loadConfigFromDb).toHaveBeenCalled();
    });
  });

  // ==================== Backup / Restore ====================

  describe('listBackups', () => {
    it('should delegate to settingsService.listBackups', async () => {
      mockSettingsService.listBackups.mockResolvedValue({ backups: [], directory: '/var/www/backups' });

      const result = await controller.listBackups();

      expect(result.backups).toEqual([]);
    });
  });

  describe('createBackup', () => {
    it('should delegate to settingsService.createBackup', async () => {
      mockSettingsService.createBackup.mockResolvedValue({ success: true, filename: 'backup.sql.gz' });

      const result = await controller.createBackup();

      expect(result.success).toBe(true);
    });
  });

  describe('restoreBackup', () => {
    it('should delegate to settingsService.restoreBackup', async () => {
      mockSettingsService.restoreBackup.mockResolvedValue({ success: true, message: 'OK' });

      const result = await controller.restoreBackup({ filename: 'backup.sql.gz' });

      expect(result.success).toBe(true);
      expect(mockSettingsService.restoreBackup).toHaveBeenCalledWith('backup.sql.gz');
    });
  });
});
