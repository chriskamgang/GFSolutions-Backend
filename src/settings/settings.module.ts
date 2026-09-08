import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { PawaPayModule } from '../pawapay/pawapay.module';
import { BillPaymentsModule } from '../bill-payments/bill-payments.module';

@Module({
  imports: [PawaPayModule, BillPaymentsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
