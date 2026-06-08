import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';

@Injectable()
export class MerchantApiKeyGuard implements CanActivate {
  constructor(private readonly gatewayService: PaymentGatewayService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) throw new UnauthorizedException('Cle API manquante (header X-API-Key)');

    const merchant = await this.gatewayService.getMerchantByApiKey(apiKey);
    if (!merchant) throw new UnauthorizedException('Cle API invalide ou marchand inactif');

    request.merchant = merchant;
    return true;
  }
}
