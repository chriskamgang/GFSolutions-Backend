import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CallboxService } from './callbox.service';
import { CallboxController } from './callbox.controller';
import { JwtCallboxStrategy } from './jwt-callbox.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [CallboxController],
  providers: [CallboxService, JwtCallboxStrategy],
  exports: [CallboxService],
})
export class CallboxModule {}
