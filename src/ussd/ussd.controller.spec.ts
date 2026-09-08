import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UssdController } from './ussd.controller';
import { UssdService } from './ussd.service';

describe('UssdController', () => {
  let controller: UssdController;
  let ussdService: UssdService;
  let configService: ConfigService;

  const mockUssdService = {
    handleRequest: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UssdController],
      providers: [
        { provide: UssdService, useValue: mockUssdService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<UssdController>(UssdController);
    ussdService = module.get<UssdService>(UssdService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleUssd', () => {
    it('should forward request to UssdService and return response', async () => {
      mockConfigService.get.mockReturnValue(undefined); // no webhook secret
      mockUssdService.handleRequest.mockResolvedValue(
        'CON Bienvenue chez Global Financial Solution\n1. Consulter solde',
      );

      const result = await controller.handleUssd(
        'session-1',
        '*123#',
        '+237690000000',
        '',
        undefined as any,
      );

      expect(result).toContain('CON');
      expect(mockUssdService.handleRequest).toHaveBeenCalledWith(
        'session-1',
        '+237690000000',
        '',
      );
    });

    it('should pass text input to service', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockUssdService.handleRequest.mockResolvedValue('CON Entrez votre code PIN:');

      await controller.handleUssd('session-1', '*123#', '+237690000000', '1', undefined as any);

      expect(mockUssdService.handleRequest).toHaveBeenCalledWith(
        'session-1',
        '+237690000000',
        '1',
      );
    });

    it('should treat null text as empty string', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockUssdService.handleRequest.mockResolvedValue('CON menu');

      await controller.handleUssd('session-1', '*123#', '+237690000000', null as any, undefined as any);

      expect(mockUssdService.handleRequest).toHaveBeenCalledWith(
        'session-1',
        '+237690000000',
        '',
      );
    });

    it('should reject requests with invalid webhook secret', async () => {
      mockConfigService.get.mockReturnValue('correct-secret');

      await expect(
        controller.handleUssd('session-1', '*123#', '+237690000000', '', 'wrong-secret'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow requests when webhook secret matches', async () => {
      mockConfigService.get.mockReturnValue('correct-secret');
      mockUssdService.handleRequest.mockResolvedValue('CON menu');

      const result = await controller.handleUssd(
        'session-1',
        '*123#',
        '+237690000000',
        '',
        'correct-secret',
      );

      expect(result).toBe('CON menu');
    });

    it('should skip webhook validation when no secret is configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockUssdService.handleRequest.mockResolvedValue('CON menu');

      const result = await controller.handleUssd(
        'session-1',
        '*123#',
        '+237690000000',
        '',
        undefined as any,
      );

      expect(result).toBe('CON menu');
    });

    it('should return error message when service throws', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockUssdService.handleRequest.mockRejectedValue(new Error('Database error'));

      const result = await controller.handleUssd(
        'session-1',
        '*123#',
        '+237690000000',
        '',
        undefined as any,
      );

      expect(result).toBe('END Une erreur est survenue. Veuillez reessayer plus tard.');
    });

    it('should catch and handle service exceptions gracefully', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockUssdService.handleRequest.mockRejectedValue(new Error('Unexpected'));

      const result = await controller.handleUssd(
        'session-1',
        '*123#',
        '+237690000000',
        '1*1234',
        undefined as any,
      );

      expect(result.startsWith('END')).toBe(true);
    });
  });
});
