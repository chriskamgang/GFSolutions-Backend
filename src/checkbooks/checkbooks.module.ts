import { Module } from '@nestjs/common';
import { CheckbooksService } from './checkbooks.service';
import { CheckbooksController } from './checkbooks.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CheckbooksController],
  providers: [CheckbooksService],
  exports: [CheckbooksService],
})
export class CheckbooksModule {}
