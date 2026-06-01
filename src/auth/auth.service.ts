import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { TOTP, generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private loginAttempts = new Map<string, { count: number; lockedUntil: Date | null }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const attempt = this.loginAttempts.get(loginDto.email);
    if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
      const remainingMs = attempt.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new ForbiddenException(
        `Compte temporairement bloque suite a trop de tentatives. Reessayez dans ${remainingMin} minute(s).`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        agency: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Votre compte est desactive');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      const current = this.loginAttempts.get(loginDto.email) || { count: 0, lockedUntil: null };
      current.count += 1;
      if (current.count >= 5) {
        current.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        this.logger.warn(`Compte ${loginDto.email} bloque pour 15 minutes apres ${current.count} tentatives echouees`);
      }
      this.loginAttempts.set(loginDto.email, current);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    this.loginAttempts.delete(loginDto.email);

    // Si 2FA active et pas de code fourni -> demander le code
    if (user.twoFactorEnabled) {
      if (!loginDto.totpCode) {
        return {
          requires2FA: true,
          message: 'Code 2FA requis',
          userId: user.id,
        };
      }

      // Verifier le code TOTP
      if (!user.twoFactorSecret) {
        throw new BadRequestException('2FA mal configure');
      }
      const isValid = verify({ token: loginDto.totpCode, secret: user.twoFactorSecret });
      if (!isValid) {
        throw new UnauthorizedException('Code 2FA invalide');
      }
    }

    // Generer un token de session unique
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Invalider les sessions precedentes (connexion unique)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), sessionToken },
    });

    const permissions = user.role.permissions.map(
      (rp) => `${rp.permission.module}:${rp.permission.action}`,
    );

    // Expiration basee sur le sessionTimeout du role (en minutes)
    const sessionTimeoutMinutes = user.role.sessionTimeout || 30;
    const expiresIn = sessionTimeoutMinutes * 60; // en secondes

    const payload = {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
      agencyId: user.agencyId,
      permissions,
      sessionToken,
    };

    return {
      access_token: this.jwtService.sign(payload, { expiresIn }),
      expiresIn, // en secondes pour le frontend
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        agencyId: user.agencyId,
        agency: user.agency?.name,
        language: user.language,
        permissions,
        twoFactorEnabled: user.twoFactorEnabled,
        sessionTimeout: sessionTimeoutMinutes,
      },
    };
  }

  /**
   * Valider le session token dans le JWT (connexion unique)
   */
  async validateSession(userId: string, sessionToken: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { sessionToken: true, isActive: true },
    });
    if (!user || !user.isActive) return false;
    return user.sessionToken === sessionToken;
  }

  /**
   * Setup 2FA : generer un secret + QR code
   */
  async setup2FA(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur non trouve');

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA deja active. Desactivez d\'abord pour reconfigurer.');
    }

    const secret = generateSecret();

    // Sauvegarder le secret (pas encore active)
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    const otpAuthUrl = generateURI({ label: user.email, issuer: 'MicroFinance-CM', secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    return {
      secret,
      qrCode: qrCodeDataUrl,
      message: 'Scannez le QR code avec Google Authenticator ou Authy, puis verifiez avec un code',
    };
  }

  /**
   * Verifier et activer le 2FA
   */
  async verify2FA(userId: string, totpCode: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur non trouve');
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Configurez d\'abord le 2FA avec /auth/2fa/setup');
    }

    const isValid = verify({ token: totpCode, secret: user.twoFactorSecret });

    if (!isValid) {
      throw new UnauthorizedException('Code invalide. Reessayez.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA active avec succes' };
  }

  /**
   * Desactiver le 2FA
   */
  async disable2FA(userId: string, totpCode: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur non trouve');
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA n\'est pas active');
    }

    const isValid = verify({ token: totpCode, secret: user.twoFactorSecret! });

    if (!isValid) {
      throw new UnauthorizedException('Code invalide');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    return { message: '2FA desactive avec succes' };
  }

  /**
   * Deconnecter (invalider le session token)
   */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionToken: null },
    });
    return { message: 'Deconnecte avec succes' };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur non trouve');
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Ancien mot de passe incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, sessionToken: null },
    });

    return { message: 'Mot de passe modifie avec succes. Veuillez vous reconnecter.' };
  }
}
