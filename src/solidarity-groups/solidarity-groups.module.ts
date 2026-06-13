import { Module } from '@nestjs/common';
import { SolidarityGroupsService } from './solidarity-groups.service';
import { SolidarityGroupsController } from './solidarity-groups.controller';

@Module({
  controllers: [SolidarityGroupsController],
  providers: [SolidarityGroupsService],
  exports: [SolidarityGroupsService],
})
export class SolidarityGroupsModule {}
