import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ClientAuthService } from './client-auth.service';

@Injectable()
export class JwtClientStrategy extends PassportStrategy(Strategy, 'jwt-client') {
  constructor(
    configService: ConfigService,
    private clientAuthService: ClientAuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
  }

  async validate(payload: any) {
    // Verifier que c'est bien un token client
    if (payload.type !== 'client') {
      throw new UnauthorizedException('Token invalide pour l\'espace client');
    }

    // Verifier la session
    if (payload.sessionToken) {
      const isValid = await this.clientAuthService.validateClientSession(
        payload.sub,
        payload.sessionToken,
      );
      if (!isValid) {
        throw new UnauthorizedException('Session expiree. Veuillez vous reconnecter.');
      }
    }

    return {
      sub: payload.sub,
      phone: payload.phone,
      clientNumber: payload.clientNumber,
      clientType: payload.clientType,
      agencyId: payload.agencyId,
      type: 'client',
    };
  }
}
