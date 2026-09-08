import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// Mock otplib and qrcode to avoid ESM import issues from AuthService
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockService = {
    login: jest.fn(),
    logout: jest.fn(),
    setup2FA: jest.fn(),
    verify2FA: jest.fn(),
    disable2FA: jest.fn(),
    changePassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('devrait etre defini', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('devrait deleguer au service avec le loginDto', async () => {
      const loginDto = { email: 'admin@test.com', password: 'pass123' };
      const expected = { access_token: 'token', user: { email: 'admin@test.com' } };
      mockService.login.mockResolvedValue(expected);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expected);
      expect(mockService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('logout', () => {
    it('devrait deleguer au service avec le userId', async () => {
      const expected = { message: 'Deconnecte avec succes' };
      mockService.logout.mockResolvedValue(expected);

      const result = await controller.logout('user-1');

      expect(result).toEqual(expected);
      expect(mockService.logout).toHaveBeenCalledWith('user-1');
    });
  });

  describe('setup2FA', () => {
    it('devrait deleguer au service avec le userId', async () => {
      const expected = { secret: 'SECRET', qrCode: 'data:...' };
      mockService.setup2FA.mockResolvedValue(expected);

      const result = await controller.setup2FA('user-1');

      expect(result).toEqual(expected);
      expect(mockService.setup2FA).toHaveBeenCalledWith('user-1');
    });
  });

  describe('verify2FA', () => {
    it('devrait deleguer au service avec le userId et le code TOTP', async () => {
      const expected = { message: '2FA active avec succes' };
      mockService.verify2FA.mockResolvedValue(expected);

      const result = await controller.verify2FA('user-1', { totpCode: '123456' });

      expect(result).toEqual(expected);
      expect(mockService.verify2FA).toHaveBeenCalledWith('user-1', '123456');
    });
  });

  describe('disable2FA', () => {
    it('devrait deleguer au service avec le userId et le code TOTP', async () => {
      const expected = { message: '2FA desactive avec succes' };
      mockService.disable2FA.mockResolvedValue(expected);

      const result = await controller.disable2FA('user-1', { totpCode: '123456' });

      expect(result).toEqual(expected);
      expect(mockService.disable2FA).toHaveBeenCalledWith('user-1', '123456');
    });
  });

  describe('changePassword', () => {
    it('devrait deleguer au service avec le userId et les mots de passe', async () => {
      const dto = { oldPassword: 'oldPass', newPassword: 'newPass' };
      const expected = { message: 'Mot de passe modifie avec succes.' };
      mockService.changePassword.mockResolvedValue(expected);

      const result = await controller.changePassword('user-1', dto);

      expect(result).toEqual(expected);
      expect(mockService.changePassword).toHaveBeenCalledWith('user-1', 'oldPass', 'newPass');
    });
  });
});
