import { Module } from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';
import {
  PaymentGatewayAdminController,
  PaymentGatewayMerchantController,
  PaymentGatewayPublicController,
} from './payment-gateway.controller';
import { MerchantApiKeyGuard } from './merchant-api-key.guard';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [WhatsappModule, SmsModule],
  controllers: [
    PaymentGatewayAdminController,
    PaymentGatewayMerchantController,
    PaymentGatewayPublicController,
  ],
  providers: [PaymentGatewayService, MerchantApiKeyGuard],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
