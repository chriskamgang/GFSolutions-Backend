import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ImportService } from './import.service';
import { ClientsController } from './clients.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ClientsController],
  providers: [ClientsService, ImportService],
  exports: [ClientsService],
})
export class ClientsModule {}
