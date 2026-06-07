import { Module } from '@nestjs/common';
import { PawaPayService } from './pawapay.service';
import { PawaPayController } from './pawapay.controller';
import { SmsModule } from '../sms/sms.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [SmsModule, AccountingModule],
  controllers: [PawaPayController],
  providers: [PawaPayService],
  exports: [PawaPayService],
})
export class PawaPayModule {}
