import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';
import { CreditsModule } from '../credits/credits.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { PawaPayModule } from '../pawapay/pawapay.module';

@Module({
  imports: [ScheduleModule.forRoot(), AccountingModule, NotificationsModule, SmsModule, CreditsModule, PaymentGatewayModule, PawaPayModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
