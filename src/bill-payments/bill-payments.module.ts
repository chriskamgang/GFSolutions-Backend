import { Module } from '@nestjs/common';
import { BillPaymentsController } from './bill-payments.controller';
import { BillPaymentsService } from './bill-payments.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BillPaymentsController],
  providers: [BillPaymentsService],
})
export class BillPaymentsModule {}
