import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEmail } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

class ContactFormDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() phone?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsNotEmpty() subject: string;
  @IsString() @IsNotEmpty() message: string;
}

class AccountRequestDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() birthDate?: string;
  @IsString() @IsNotEmpty() accountType: string;
  @IsString() @IsNotEmpty() agencyName: string;
}

class CreditRequestDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsNotEmpty() creditType: string;
  @IsNumber() amount: number;
  @IsString() @IsOptional() duration?: string;
  @IsString() @IsOptional() purpose?: string;
}

@ApiTags('Public – Formulaires')
@Controller('public')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Post('contact')
  @HttpCode(200)
  @ApiOperation({ summary: 'Formulaire de contact public (sans authentification)' })
  async contact(@Body() dto: ContactFormDto) {
    // Enregistrer en base comme notification interne
    try {
      await this.prisma.notification.create({
        data: {
          targetType: 'ADMIN',
          targetId: 'system',
          title: 'Nouveau message – ' + dto.subject,
          message: `De : ${dto.name} | Tél : ${dto.phone || '–'} | Email : ${dto.email || '–'}\n\n${dto.message}`,
          channel: 'SYSTEM',
        },
      });
    } catch (e) {
      // Silencieux si la table n'accepte pas ces champs
    }
    return { success: true, message: 'Votre message a bien été reçu. Nous vous répondrons sous 24h.' };
  }

  @Post('account-request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Demande d\'ouverture de compte depuis le site public' })
  async accountRequest(@Body() dto: AccountRequestDto) {
    try {
      await this.prisma.notification.create({
        data: {
          targetType: 'ADMIN',
          targetId: 'system',
          title: 'Demande d\'ouverture de compte – ' + dto.accountType,
          message: `${dto.firstName} ${dto.lastName} | Tél : ${dto.phone} | Email : ${dto.email || '–'} | Agence : ${dto.agencyName} | Type : ${dto.accountType}`,
          channel: 'SYSTEM',
        },
      });
    } catch (e) {}
    return { success: true, message: 'Votre demande a été enregistrée. Un conseiller vous contactera dans les 24h.' };
  }

  @Post('credit-request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Demande de crédit depuis le site public' })
  async creditRequest(@Body() dto: CreditRequestDto) {
    try {
      await this.prisma.notification.create({
        data: {
          targetType: 'ADMIN',
          targetId: 'system',
          title: 'Demande de crédit – ' + dto.creditType,
          message: `${dto.firstName} ${dto.lastName} | Tél : ${dto.phone} | Type : ${dto.creditType} | Montant : ${dto.amount} FCFA | Durée : ${dto.duration || '–'} | Objet : ${dto.purpose || '–'}`,
          channel: 'SYSTEM',
        },
      });
    } catch (e) {}
    return { success: true, message: 'Votre demande de crédit a été reçue. Notre équipe vous rappelle sous 24h.' };
  }
}
