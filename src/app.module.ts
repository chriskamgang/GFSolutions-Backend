import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { AccountsModule } from './accounts/accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { RolesModule } from './roles/roles.module';
import { AgenciesModule } from './agencies/agencies.module';
import { CompaniesModule } from './companies/companies.module';
import { ContributionsModule } from './contributions/contributions.module';
import { CreditsModule } from './credits/credits.module';
import { AccountingModule } from './accounting/accounting.module';
import { TreasuryModule } from './treasury/treasury.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CheckbooksModule } from './checkbooks/checkbooks.module';
import { TontinesModule } from './tontines/tontines.module';
import { ClientAuthModule } from './client-auth/client-auth.module';
import { SmsModule } from './sms/sms.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { SavingsGoalsModule } from './savings-goals/savings-goals.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { UssdModule } from './ussd/ussd.module';
import { SettingsModule } from './settings/settings.module';
import { AppController } from './app.controller';
import { PublicModule } from './public/public.module';
import { BillPaymentsModule } from './bill-payments/bill-payments.module';
import { CallboxModule } from './callbox/callbox.module';
import { PawaPayModule } from './pawapay/pawapay.module';
import { PaymentGatewayModule } from './payment-gateway/payment-gateway.module';
import { SolidarityGroupsModule } from './solidarity-groups/solidarity-groups.module';
import { AmlModule } from './aml/aml.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SmsModule,
    WhatsappModule,
    AuthModule,
    ClientAuthModule,
    UsersModule,
    ClientsModule,
    AccountsModule,
    TransactionsModule,
    RolesModule,
    AgenciesModule,
    CompaniesModule,
    ContributionsModule,
    CreditsModule,
    AccountingModule,
    TreasuryModule,
    ReportsModule,
    AuditModule,
    NotificationsModule,
    CheckbooksModule,
    TontinesModule,
    SavingsGoalsModule,
    SchedulerModule,
    UssdModule,
    SettingsModule,
    PublicModule,
    BillPaymentsModule,
    CallboxModule,
    PawaPayModule,
    PaymentGatewayModule,
    SolidarityGroupsModule,
    AmlModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
