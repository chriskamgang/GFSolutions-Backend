import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { PrismaService } from '../prisma/prisma.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('SmsService', () => {
  let service: SmsService;
  let configService: ConfigService;
  let prisma: PrismaService;

  const mockPrisma = {
    setting: {
      findMany: jest.fn(),
    },
  };

  const createService = async (envConfig: Record<string, string> = {}) => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => envConfig[key] || defaultValue || ''),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    return {
      service: module.get<SmsService>(SmsService),
      configService: module.get<ConfigService>(ConfigService),
      prisma: module.get<PrismaService>(PrismaService),
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    const result = await createService({
      NEXAH_SMS_USER: 'testuser',
      NEXAH_SMS_PASSWORD: 'testpass',
      NEXAH_SMS_SENDER_ID: 'GFS',
    });
    service = result.service;
    configService = result.configService;
    prisma = result.prisma;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // send
  // ==========================================================

  describe('send', () => {
    it('should send SMS via NEXAH API', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 'success' }),
      });

      const result = await service.send('690000000', 'Test message');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://smsvas.com/bulk/public/index.php/api/v1/sendsms',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.user).toBe('testuser');
      expect(body.password).toBe('testpass');
      expect(body.senderid).toBe('GFS');
      expect(body.sms).toBe('Test message');
      expect(body.mobiles).toBe('237690000000');
    });

    it('should return false on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.send('690000000', 'Test');

      expect(result).toBe(false);
    });

    it('should simulate SMS when not configured', async () => {
      const { service: unconfigured } = await createService({});
      // loadConfigFromDb will also fail
      mockPrisma.setting.findMany.mockResolvedValue([]);

      const result = await unconfigured.send('690000000', 'Test');

      expect(result).toBe(true); // simulated
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should load config from DB when env vars are missing', async () => {
      const { service: unconfigured } = await createService({});
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'nexah_sms_user', value: 'dbuser', category: 'sms' },
        { key: 'nexah_sms_password', value: 'dbpass', category: 'sms' },
        { key: 'nexah_sms_sender_id', value: 'DBGFS', category: 'sms' },
        { key: 'nexah_sms_enabled', value: 'true', category: 'sms' },
      ]);
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 'ok' }),
      });

      await unconfigured.send('690000000', 'Hello from DB config');

      expect(mockPrisma.setting.findMany).toHaveBeenCalledWith({
        where: { category: 'sms' },
      });
      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.user).toBe('dbuser');
    });
  });

  // ==========================================================
  // formatPhone (private)
  // ==========================================================

  describe('formatPhone (private)', () => {
    it('should add 237 prefix for local numbers starting with 6', () => {
      const result = (service as any).formatPhone('690000000');
      expect(result).toBe('237690000000');
    });

    it('should keep number with 237 prefix', () => {
      const result = (service as any).formatPhone('237690000000');
      expect(result).toBe('237690000000');
    });

    it('should strip + from international format', () => {
      const result = (service as any).formatPhone('+237690000000');
      expect(result).toBe('237690000000');
    });

    it('should strip spaces and dashes', () => {
      const result = (service as any).formatPhone('237 690-000.000');
      expect(result).toBe('237690000000');
    });

    it('should fix double 237 prefix', () => {
      const result = (service as any).formatPhone('237237690000000');
      expect(result).toBe('237690000000');
    });

    it('should add 237 prefix for numbers starting with 2', () => {
      const result = (service as any).formatPhone('222000000');
      expect(result).toBe('237222000000');
    });
  });

  // ==========================================================
  // sendCredentials
  // ==========================================================

  describe('sendCredentials', () => {
    it('should send credentials SMS with client info', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 'ok' }),
      });

      const result = await service.sendCredentials(
        '690000000',
        'Jean Dupont',
        'CLI001',
        'Pass1234',
      );

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sms).toContain('Jean Dupont');
      expect(body.sms).toContain('CLI001');
      expect(body.sms).toContain('Pass1234');
      expect(body.sms).toContain('Global Financial Solution');
    });
  });

  // ==========================================================
  // sendDepositAlert
  // ==========================================================

  describe('sendDepositAlert', () => {
    it('should send deposit alert with formatted amounts', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 'ok' }),
      });

      const result = await service.sendDepositAlert('690000000', 'ACC001', 150000, 500000);

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sms).toContain('CREDITE');
      expect(body.sms).toContain('ACC001');
      expect(body.sms).toContain('150 000');
      expect(body.sms).toContain('500 000');
    });
  });

  // ==========================================================
  // sendWithdrawalAlert
  // ==========================================================

  describe('sendWithdrawalAlert', () => {
    it('should send withdrawal alert', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 'ok' }),
      });

      const result = await service.sendWithdrawalAlert('690000000', 'ACC001', 50000, 450000);

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sms).toContain('DEBITE');
      expect(body.sms).toContain('ACC001');
      expect(body.sms).toContain('50 000');
      expect(body.sms).toContain('450 000');
    });
  });

  // ==========================================================
  // sendTransferSentAlert
  // ==========================================================

  describe('sendTransferSentAlert', () => {
    it('should send transfer sent alert (debit)', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 'ok' }),
      });

      const result = await service.sendTransferSentAlert('690000000', 'ACC001', 100000, 400000);

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sms).toContain('DEBITE');
      expect(body.sms).toContain('100 000');
    });
  });

  // ==========================================================
  // sendTransferReceivedAlert
  // ==========================================================

  describe('sendTransferReceivedAlert', () => {
    it('should send transfer received alert (credit)', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 'ok' }),
      });

      const result = await service.sendTransferReceivedAlert('690000000', 'ACC001', 100000, 600000);

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sms).toContain('CREDITE');
      expect(body.sms).toContain('100 000');
    });
  });

  // ==========================================================
  // checkCredit
  // ==========================================================

  describe('checkCredit', () => {
    it('should return credit balance from NEXAH API', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ credit: 150 }),
      });

      const result = await service.checkCredit();

      expect(result).toEqual({ credit: 150 });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://smsvas.com/bulk/public/index.php/api/v1/smscredit',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should return error on failure', async () => {
      mockFetch.mockRejectedValue(new Error('API down'));

      const result = await service.checkCredit();

      expect(result.error).toBeDefined();
    });

    it('should return not configured when SMS is disabled', async () => {
      const { service: unconfigured } = await createService({});

      const result = await unconfigured.checkCredit();

      expect(result.enabled).toBe(false);
      expect(result.message).toContain('non configure');
    });
  });

  // ==========================================================
  // getConfigStatus
  // ==========================================================

  describe('getConfigStatus', () => {
    it('should return configured status when credentials are set', () => {
      const status = service.getConfigStatus();

      expect(status.configured).toBe(true);
      expect(status.user).toBe('testuser');
      expect(status.senderId).toBe('GFS');
      expect(status.enabled).toBe(true);
    });

    it('should return not configured when credentials are empty', async () => {
      const { service: unconfigured } = await createService({});

      const status = unconfigured.getConfigStatus();

      expect(status.configured).toBe(false);
      expect(status.enabled).toBe(false);
    });
  });

  // ==========================================================
  // updateConfig
  // ==========================================================

  describe('updateConfig', () => {
    it('should update config in memory', async () => {
      await service.updateConfig('newuser', 'newpass', 'NEWSENDER', true);

      const status = service.getConfigStatus();
      expect(status.user).toBe('newuser');
      expect(status.senderId).toBe('NEWSENDER');
      expect(status.enabled).toBe(true);
    });

    it('should disable when user or password is empty', async () => {
      await service.updateConfig('', 'pass', 'GFS', true);

      const status = service.getConfigStatus();
      expect(status.enabled).toBe(false);
    });

    it('should use default sender ID when empty', async () => {
      await service.updateConfig('user', 'pass', '', true);

      const status = service.getConfigStatus();
      expect(status.senderId).toBe('GFS');
    });
  });

  // ==========================================================
  // loadConfigFromDb
  // ==========================================================

  describe('loadConfigFromDb', () => {
    it('should load config from database settings', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'nexah_sms_user', value: 'dbuser', category: 'sms' },
        { key: 'nexah_sms_password', value: 'dbpass', category: 'sms' },
        { key: 'nexah_sms_sender_id', value: 'DBGFS', category: 'sms' },
      ]);

      await service.loadConfigFromDb();

      const status = service.getConfigStatus();
      expect(status.user).toBe('dbuser');
      expect(status.senderId).toBe('DBGFS');
    });

    it('should handle DB errors gracefully', async () => {
      mockPrisma.setting.findMany.mockRejectedValue(new Error('DB error'));

      await expect(service.loadConfigFromDb()).resolves.not.toThrow();
    });

    it('should not update config if DB settings are incomplete', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'nexah_sms_user', value: 'dbuser', category: 'sms' },
        // missing password
      ]);

      const originalStatus = service.getConfigStatus();
      await service.loadConfigFromDb();
      const newStatus = service.getConfigStatus();

      expect(newStatus.user).toBe(originalStatus.user);
    });

    it('should handle nexah_sms_enabled=false from DB', async () => {
      const { service: unconfigured } = await createService({});
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'nexah_sms_user', value: 'dbuser', category: 'sms' },
        { key: 'nexah_sms_password', value: 'dbpass', category: 'sms' },
        { key: 'nexah_sms_enabled', value: 'false', category: 'sms' },
      ]);

      await unconfigured.loadConfigFromDb();

      const status = unconfigured.getConfigStatus();
      expect(status.enabled).toBe(false);
    });
  });

  // ==========================================================
  // formatAmount (private)
  // ==========================================================

  describe('formatAmount (private)', () => {
    it('should format amounts with space separators', () => {
      expect((service as any).formatAmount(1000000)).toBe('1 000 000');
      expect((service as any).formatAmount(500)).toBe('500');
      expect((service as any).formatAmount(0)).toBe('0');
    });

    it('should round decimal amounts', () => {
      expect((service as any).formatAmount(1234.56)).toBe('1 235');
    });
  });
});
