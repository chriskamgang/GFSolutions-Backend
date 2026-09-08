import { Module } from '@nestjs/common';
import { BillPaymentsController } from './bill-payments.controller';
import { BillPaymentsService } from './bill-payments.service';
import { ElgioPayService } from './elgiopay.service';
import { ElgioPayWebhookController } from './elgiopay-webhook.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BillPaymentsController, ElgioPayWebhookController],
  providers: [BillPaymentsService, ElgioPayService],
  exports: [ElgioPayService],
})
export class BillPaymentsModule {}
