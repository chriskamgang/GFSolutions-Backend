import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'MOCK_SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/test'),
  verify: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,MOCKQR')),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'mock-session-token-hex'),
  })),
}));

import * as bcrypt from 'bcrypt';
import { verify as otplibVerify, generateSecret, generateURI } from 'otplib';
import * as QRCode from 'qrcode';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mock-jwt-token'),
  };

  const mockUser = {
    id: 'user-1',
    email: 'admin@test.com',
    password: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    sessionToken: null,
    roleId: 'role-1',
    agencyId: 'agency-1',
    language: 'fr',
    role: {
      name: 'Admin',
      sessionTimeout: 30,
      permissions: [
        { permission: { module: 'users', action: 'read' } },
        { permission: { module: 'users', action: 'write' } },
      ],
    },
    agency: { name: 'Agence Douala' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    jest.clearAllMocks();

    // Reset internal loginAttempts map
    (service as any).loginAttempts = new Map();
  });

  describe('login', () => {
    const loginDto = { email: 'admin@test.com', password: 'password123' };

    it('devrait retourner un token JWT pour un login valide', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.user!.email).toBe('admin@test.com');
      expect(result.user!.role).toBe('Admin');
      expect(result.user!.permissions).toEqual(['users:read', 'users:write']);
      expect(result.expiresIn).toBe(1800); // 30 * 60
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ sessionToken: 'mock-session-token-hex' }),
        }),
      );
    });

    it('devrait lancer UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Email ou mot de passe incorrect');
    });

    it('devrait lancer ForbiddenException si le compte est desactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
      await expect(service.login(loginDto)).rejects.toThrow('Votre compte est desactive');
    });

    it('devrait lancer UnauthorizedException si le mot de passe est incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Email ou mot de passe incorrect');
    });

    it('devrait bloquer le compte apres 5 tentatives echouees', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // 5 tentatives echouees
      for (let i = 0; i < 5; i++) {
        await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      }

      // La 6e tentative devrait etre bloquee
      await expect(service.login(loginDto)).rejects.toThrow(ForbiddenException);
      await expect(service.login(loginDto)).rejects.toThrow(/Compte temporairement bloque/);
    });

    it('devrait retourner requires2FA si 2FA active et pas de code TOTP', async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true, twoFactorSecret: 'secret123' };
      mockPrisma.user.findUnique.mockResolvedValue(userWith2FA);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toEqual({
        requires2FA: true,
        message: 'Code 2FA requis',
        userId: 'user-1',
      });
    });

    it('devrait lancer UnauthorizedException si le code 2FA est invalide', async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true, twoFactorSecret: 'secret123' };
      mockPrisma.user.findUnique.mockResolvedValue(userWith2FA);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (otplibVerify as jest.Mock).mockReturnValue(false);

      await expect(
        service.login({ ...loginDto, totpCode: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devrait authentifier avec un code 2FA valide', async () => {
      const userWith2FA = { ...mockUser, twoFactorEnabled: true, twoFactorSecret: 'secret123' };
      mockPrisma.user.findUnique.mockResolvedValue(userWith2FA);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (otplibVerify as jest.Mock).mockReturnValue(true);
      mockPrisma.user.update.mockResolvedValue(userWith2FA);

      const result = await service.login({ ...loginDto, totpCode: '123456' });

      expect(result.access_token).toBe('mock-jwt-token');
    });

    it('devrait lancer BadRequestException si 2FA active mais secret manquant', async () => {
      const userBad2FA = { ...mockUser, twoFactorEnabled: true, twoFactorSecret: null };
      mockPrisma.user.findUnique.mockResolvedValue(userBad2FA);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ ...loginDto, totpCode: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait reinitialiser les tentatives apres un login reussi', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);

      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);
      expect(result.access_token).toBeDefined();
    });
  });

  describe('validateSession', () => {
    it('devrait retourner true pour un session token valide', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        sessionToken: 'valid-token',
        isActive: true,
      });

      const result = await service.validateSession('user-1', 'valid-token');
      expect(result).toBe(true);
    });

    it('devrait retourner false si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateSession('user-1', 'token');
      expect(result).toBe(false);
    });

    it('devrait retourner false si le compte est desactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        sessionToken: 'valid-token',
        isActive: false,
      });

      const result = await service.validateSession('user-1', 'valid-token');
      expect(result).toBe(false);
    });

    it('devrait retourner false si le session token ne correspond pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        sessionToken: 'different-token',
        isActive: true,
      });

      const result = await service.validateSession('user-1', 'wrong-token');
      expect(result).toBe(false);
    });
  });

  describe('setup2FA', () => {
    it('devrait generer un secret et QR code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, twoFactorEnabled: false });
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.setup2FA('user-1');

      expect(result.secret).toBe('MOCK_SECRET');
      expect(result.qrCode).toBe('data:image/png;base64,MOCKQR');
      expect(result.message).toContain('Scannez le QR code');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorSecret: 'MOCK_SECRET' },
      });
    });

    it('devrait lancer UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setup2FA('user-1')).rejects.toThrow(UnauthorizedException);
    });

    it('devrait lancer BadRequestException si 2FA deja active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, twoFactorEnabled: true });

      await expect(service.setup2FA('user-1')).rejects.toThrow(BadRequestException);
      await expect(service.setup2FA('user-1')).rejects.toThrow(/2FA deja active/);
    });
  });

  describe('verify2FA', () => {
    it('devrait activer le 2FA avec un code valide', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        twoFactorSecret: 'secret123',
      });
      (otplibVerify as jest.Mock).mockReturnValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.verify2FA('user-1', '123456');

      expect(result.message).toBe('2FA active avec succes');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: true },
      });
    });

    it('devrait lancer UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verify2FA('user-1', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('devrait lancer BadRequestException si le secret n\'est pas configure', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        twoFactorSecret: null,
      });

      await expect(service.verify2FA('user-1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('devrait lancer UnauthorizedException si le code est invalide', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        twoFactorSecret: 'secret123',
      });
      (otplibVerify as jest.Mock).mockReturnValue(false);

      await expect(service.verify2FA('user-1', '000000')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('disable2FA', () => {
    it('devrait desactiver le 2FA avec un code valide', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'secret123',
      });
      (otplibVerify as jest.Mock).mockReturnValue(true);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.disable2FA('user-1', '123456');

      expect(result.message).toBe('2FA desactive avec succes');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
    });

    it('devrait lancer UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.disable2FA('user-1', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('devrait lancer BadRequestException si 2FA n\'est pas active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: false,
      });

      await expect(service.disable2FA('user-1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('devrait lancer UnauthorizedException si le code est invalide', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'secret123',
      });
      (otplibVerify as jest.Mock).mockReturnValue(false);

      await expect(service.disable2FA('user-1', '000000')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('devrait invalider le session token', async () => {
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.logout('user-1');

      expect(result.message).toBe('Deconnecte avec succes');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { sessionToken: null },
      });
    });
  });

  describe('changePassword', () => {
    it('devrait changer le mot de passe avec l\'ancien mot de passe correct', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.changePassword('user-1', 'oldPass', 'newPass');

      expect(result.message).toContain('Mot de passe modifie');
      expect(bcrypt.hash).toHaveBeenCalledWith('newPass', 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { password: 'new-hashed-password', sessionToken: null },
      });
    });

    it('devrait lancer UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.changePassword('user-1', 'old', 'new')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('devrait lancer UnauthorizedException si l\'ancien mot de passe est incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword('user-1', 'wrong', 'new')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.changePassword('user-1', 'wrong', 'new')).rejects.toThrow(
        'Ancien mot de passe incorrect',
      );
    });
  });
});
