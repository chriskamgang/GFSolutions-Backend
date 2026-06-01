import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AccountingModule, AuditModule],
  controllers: [CreditsController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
