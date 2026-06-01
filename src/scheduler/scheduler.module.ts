import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [ScheduleModule.forRoot(), AccountingModule, NotificationsModule, SmsModule, CreditsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
