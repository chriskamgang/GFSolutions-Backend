import { Module } from '@nestjs/common';
import { AmlService } from './aml.service';
import { AmlController } from './aml.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AmlController],
  providers: [AmlService],
  exports: [AmlService],
})
export class AmlModule {}
