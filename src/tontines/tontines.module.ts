import { Module } from '@nestjs/common';
import { TontinesService } from './tontines.service';
import { TontinesController } from './tontines.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [TontinesController],
  providers: [TontinesService],
  exports: [TontinesService],
})
export class TontinesModule {}
