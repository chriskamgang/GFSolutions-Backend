import { Module } from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';
import {
  PaymentGatewayAdminController,
  PaymentGatewayMerchantController,
  PaymentGatewayPublicController,
} from './payment-gateway.controller';
import { MerchantApiKeyGuard } from './merchant-api-key.guard';

@Module({
  controllers: [
    PaymentGatewayAdminController,
    PaymentGatewayMerchantController,
    PaymentGatewayPublicController,
  ],
  providers: [PaymentGatewayService, MerchantApiKeyGuard],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
