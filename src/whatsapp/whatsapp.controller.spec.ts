import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let whatsappService: WhatsappService;

  const mockWhatsappService = {
    getStatus: jest.fn(),
    reconnect: jest.fn(),
    disconnect: jest.fn(),
    sendMessage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: WhatsappService, useValue: mockWhatsappService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WhatsappController>(WhatsappController);
    whatsappService = module.get<WhatsappService>(WhatsappService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return WhatsApp status from service', () => {
      const statusResult = {
        status: 'connected' as const,
        qrCode: null,
        message: 'Connecte',
      };
      mockWhatsappService.getStatus.mockReturnValue(statusResult);

      const result = controller.getStatus();

      expect(result).toEqual(statusResult);
      expect(mockWhatsappService.getStatus).toHaveBeenCalled();
    });

    it('should return qr_pending status with QR code', () => {
      const statusResult = {
        status: 'qr_pending',
        qrCode: 'data:image/png;base64,qrdata',
        message: 'Scannez le QR Code avec votre telephone WhatsApp',
      };
      mockWhatsappService.getStatus.mockReturnValue(statusResult);

      const result = controller.getStatus();

      expect(result.status).toBe('qr_pending');
      expect(result.qrCode).toBeDefined();
    });

    it('should return disconnected status', () => {
      const statusResult = {
        status: 'disconnected',
        qrCode: null,
        message: 'Non connecte',
      };
      mockWhatsappService.getStatus.mockReturnValue(statusResult);

      const result = controller.getStatus();

      expect(result.status).toBe('disconnected');
      expect(result.qrCode).toBeNull();
    });
  });

  describe('reconnect', () => {
    it('should call reconnect on service and return success', async () => {
      mockWhatsappService.reconnect.mockResolvedValue(undefined);

      const result = await controller.reconnect();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Reconnexion lancee');
      expect(mockWhatsappService.reconnect).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should call disconnect on service and return success', async () => {
      mockWhatsappService.disconnect.mockResolvedValue(undefined);

      const result = await controller.disconnect();

      expect(result.success).toBe(true);
      expect(result.message).toContain('deconnecte');
      expect(mockWhatsappService.disconnect).toHaveBeenCalled();
    });
  });

  describe('test', () => {
    it('should send test message and return success', async () => {
      mockWhatsappService.sendMessage.mockResolvedValue(true);

      const result = await controller.test({ phone: '690000000' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Message envoye');
      expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
        '690000000',
        expect.stringContaining('Test WhatsApp GFS'),
      );
    });

    it('should return failure when message not sent', async () => {
      mockWhatsappService.sendMessage.mockResolvedValue(false);

      const result = await controller.test({ phone: '690000000' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Echec');
    });
  });
});
