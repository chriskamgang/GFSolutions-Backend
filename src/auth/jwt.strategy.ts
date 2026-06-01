import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
  }

  async validate(payload: any) {
    // Verifier que le session token est toujours valide (connexion unique)
    if (payload.sessionToken) {
      const isValid = await this.authService.validateSession(payload.sub, payload.sessionToken);
      if (!isValid) {
        throw new UnauthorizedException('Session invalide. Vous avez ete deconnecte (connexion depuis un autre appareil).');
      }
    }

    return {
      sub: payload.sub,
      email: payload.email,
      roleId: payload.roleId,
      roleName: payload.roleName,
      agencyId: payload.agencyId,
      permissions: payload.permissions,
    };
  }
}
