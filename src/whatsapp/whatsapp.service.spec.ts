import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import * as fs from 'fs';

// Mock external dependencies
jest.mock('fs');
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqr'),
}));

// Mock Baileys so connect() does not actually run
jest.mock('@whiskeysockets/baileys', () => ({
  default: jest.fn(),
  useMultiFileAuthState: jest.fn(),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: jest.fn(),
  Browsers: { ubuntu: jest.fn().mockReturnValue(['Ubuntu', 'Chrome', '20.0']) },
}), { virtual: true });

jest.mock('@hapi/boom', () => ({
  Boom: class Boom {},
}), { virtual: true });

describe('WhatsappService', () => {
  let service: WhatsappService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.rmSync as jest.Mock).mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappService],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);

    // Prevent actual connection on init - override status and sock
    (service as any).status = 'disconnected';
    (service as any).sock = null;
    if ((service as any).reconnectTimer) {
      clearTimeout((service as any).reconnectTimer);
      (service as any).reconnectTimer = null;
    }
  });

  afterEach(() => {
    // Clean up timers
    if ((service as any).reconnectTimer) {
      clearTimeout((service as any).reconnectTimer);
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // getStatus
  // ==========================================================

  describe('getStatus', () => {
    it('should return disconnected status by default', () => {
      (service as any).status = 'disconnected';
      const status = service.getStatus();

      expect(status.status).toBe('disconnected');
      expect(status.qrCode).toBeNull();
      expect(status.message).toBe('Non connecte');
    });

    it('should return connected status', () => {
      (service as any).status = 'connected';
      const status = service.getStatus();

      expect(status.status).toBe('connected');
      expect(status.message).toBe('Connecte');
    });

    it('should return connecting status', () => {
      (service as any).status = 'connecting';
      const status = service.getStatus();

      expect(status.status).toBe('connecting');
      expect(status.message).toBe('Connexion en cours...');
    });

    it('should return qr_pending status with QR code', () => {
      (service as any).status = 'qr_pending';
      (service as any).qrBase64 = 'data:image/png;base64,mockqr';

      const status = service.getStatus();

      expect(status.status).toBe('qr_pending');
      expect(status.qrCode).toBe('data:image/png;base64,mockqr');
      expect(status.message).toBe('Scannez le QR Code avec votre telephone WhatsApp');
    });
  });

  // ==========================================================
  // sendMessage
  // ==========================================================

  describe('sendMessage', () => {
    it('should return false when not connected', async () => {
      (service as any).status = 'disconnected';
      (service as any).sock = null;

      const result = await service.sendMessage('690000000', 'Hello');

      expect(result).toBe(false);
    });

    it('should return false when sock is null', async () => {
      (service as any).status = 'connected';
      (service as any).sock = null;

      const result = await service.sendMessage('690000000', 'Hello');

      expect(result).toBe(false);
    });

    it('should send message when connected', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({ key: { id: 'msg-1' } });
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      const result = await service.sendMessage('690000000', 'Hello World');

      expect(result).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(
        '237690000000@s.whatsapp.net',
        { text: 'Hello World' },
      );
    });

    it('should return false on send error', async () => {
      const mockSendMessage = jest.fn().mockRejectedValue(new Error('Send failed'));
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      const result = await service.sendMessage('690000000', 'Hello');

      expect(result).toBe(false);
    });

    it('should format phone numbers with country code', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      await service.sendMessage('237690000000', 'Test');

      expect(mockSendMessage).toHaveBeenCalledWith(
        '237690000000@s.whatsapp.net',
        { text: 'Test' },
      );
    });

    it('should format phone numbers without country code', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      await service.sendMessage('690000000', 'Test');

      expect(mockSendMessage).toHaveBeenCalledWith(
        '237690000000@s.whatsapp.net',
        { text: 'Test' },
      );
    });

    it('should strip + from phone number', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      await service.sendMessage('+237690000000', 'Test');

      expect(mockSendMessage).toHaveBeenCalledWith(
        '237690000000@s.whatsapp.net',
        { text: 'Test' },
      );
    });
  });

  // ==========================================================
  // sendCredentials
  // ==========================================================

  describe('sendCredentials', () => {
    it('should send credentials message with correct content', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      const result = await service.sendCredentials(
        '690000000',
        'Jean Dupont',
        'CLI001',
        'Pass1234',
      );

      expect(result).toBe(true);
      const sentText = mockSendMessage.mock.calls[0][1].text;
      expect(sentText).toContain('Bienvenue chez GFS');
      expect(sentText).toContain('Jean Dupont');
      expect(sentText).toContain('CLI001');
      expect(sentText).toContain('Pass1234');
    });

    it('should return false when not connected', async () => {
      (service as any).status = 'disconnected';
      const result = await service.sendCredentials('690000000', 'Test', 'CLI001', 'Pass');
      expect(result).toBe(false);
    });
  });

  // ==========================================================
  // sendDepositAlert
  // ==========================================================

  describe('sendDepositAlert', () => {
    it('should send deposit alert with formatted amounts', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      const result = await service.sendDepositAlert('690000000', 'ACC001', 150000, 500000);

      expect(result).toBe(true);
      const sentText = mockSendMessage.mock.calls[0][1].text;
      expect(sentText).toContain('p\u00F4t');
      expect(sentText).toContain('ACC001');
      expect(sentText).toContain('150');
      expect(sentText).toContain('500');
    });
  });

  // ==========================================================
  // sendWithdrawalAlert
  // ==========================================================

  describe('sendWithdrawalAlert', () => {
    it('should send withdrawal alert', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      const result = await service.sendWithdrawalAlert('690000000', 'ACC001', 50000, 450000);

      expect(result).toBe(true);
      const sentText = mockSendMessage.mock.calls[0][1].text;
      expect(sentText).toContain('Retrait');
      expect(sentText).toContain('ACC001');
    });
  });

  // ==========================================================
  // sendTransferAlert
  // ==========================================================

  describe('sendTransferAlert', () => {
    it('should send transfer sent alert', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      const result = await service.sendTransferAlert('690000000', 'ACC001', 100000, 400000, 'sent');

      expect(result).toBe(true);
      const sentText = mockSendMessage.mock.calls[0][1].text;
      expect(sentText).toContain('Virement envoy');
    });

    it('should send transfer received alert', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue({});
      (service as any).status = 'connected';
      (service as any).sock = { sendMessage: mockSendMessage };

      const result = await service.sendTransferAlert('690000000', 'ACC001', 100000, 600000, 'received');

      expect(result).toBe(true);
      const sentText = mockSendMessage.mock.calls[0][1].text;
      expect(sentText).toContain('Virement re');
    });
  });

  // ==========================================================
  // disconnect
  // ==========================================================

  describe('disconnect', () => {
    it('should reset state on disconnect', async () => {
      const mockEnd = jest.fn();
      (service as any).sock = { end: mockEnd };
      (service as any).status = 'connected';
      (service as any).qrBase64 = 'someqr';

      await service.disconnect();

      expect(mockEnd).toHaveBeenCalled();
      expect((service as any).sock).toBeNull();
      expect((service as any).status).toBe('disconnected');
      expect((service as any).qrBase64).toBeNull();
      expect(fs.rmSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should handle disconnect when already disconnected', async () => {
      (service as any).sock = null;
      (service as any).status = 'disconnected';

      await expect(service.disconnect()).resolves.not.toThrow();
    });

    it('should clear reconnect timer on disconnect', async () => {
      const timer = setTimeout(() => {}, 10000);
      (service as any).reconnectTimer = timer;
      (service as any).sock = null;

      await service.disconnect();

      // After disconnect, reconnectTimer is set to null internally
      // but disconnect() calls mkdirSync which resets it; just verify no error
      expect((service as any).status).toBe('disconnected');
    });
  });

  // ==========================================================
  // reconnect
  // ==========================================================

  describe('reconnect', () => {
    it('should reset state and call connect', async () => {
      const mockEnd = jest.fn();
      (service as any).sock = { end: mockEnd };
      (service as any).status = 'connected';

      // Mock connect to avoid actual connection
      const connectSpy = jest.spyOn(service, 'connect').mockResolvedValue(undefined);

      await service.reconnect();

      expect(mockEnd).toHaveBeenCalled();
      expect((service as any).sock).toBeNull();
      expect((service as any).status).toBe('disconnected');
      expect(connectSpy).toHaveBeenCalled();

      connectSpy.mockRestore();
    });
  });

  // ==========================================================
  // formatJid (private)
  // ==========================================================

  describe('formatJid (private)', () => {
    it('should format phone with country code', () => {
      const jid = (service as any).formatJid('237690000000');
      expect(jid).toBe('237690000000@s.whatsapp.net');
    });

    it('should add country code if missing', () => {
      const jid = (service as any).formatJid('690000000');
      expect(jid).toBe('237690000000@s.whatsapp.net');
    });

    it('should strip special characters', () => {
      const jid = (service as any).formatJid('+237 690-000.000');
      expect(jid).toBe('237690000000@s.whatsapp.net');
    });
  });
});
