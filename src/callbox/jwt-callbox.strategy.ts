import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CallboxService } from './callbox.service';

@Injectable()
export class JwtCallboxStrategy extends PassportStrategy(Strategy, 'jwt-callbox') {
  constructor(
    configService: ConfigService,
    private callboxService: CallboxService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
  }

  async validate(payload: any) {
    if (payload.type !== 'CALLBOX') {
      throw new UnauthorizedException('Token non valide pour un callbox');
    }

    const isValid = await this.callboxService.validateSession(payload.sub, payload.sessionToken);
    if (!isValid) {
      throw new UnauthorizedException('Session expirée. Reconnectez-vous.');
    }

    return {
      callboxId: payload.sub,
      callboxNumber: payload.callboxNumber,
      agencyId: payload.agencyId,
      type: 'CALLBOX',
    };
  }
}
