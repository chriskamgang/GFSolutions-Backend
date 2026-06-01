import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsUUID,
  IsDateString,
  Min,
} from 'class-validator';
import { ContributionFrequency } from '@prisma/client';

export class CreateTontineGroupDto {
  @ApiProperty({ description: 'Nom du groupe tontine' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Description du groupe' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Montant de la cotisation par membre par tour' })
  @IsNumber()
  @Min(1)
  contributionAmount: number;

  @ApiProperty({ enum: ContributionFrequency, description: 'Frequence des cotisations' })
  @IsEnum(ContributionFrequency)
  frequency: ContributionFrequency;

  @ApiProperty({ description: 'Nombre maximum de membres' })
  @IsNumber()
  @Min(2)
  maxMembers: number;

  @ApiProperty({ description: 'ID de l\'agence' })
  @IsUUID()
  agencyId: string;

  @ApiPropertyOptional({ description: 'Date de debut (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;
}

export class AddTontineMemberDto {
  @ApiProperty({ description: 'ID du client a ajouter' })
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({ description: 'Ordre dans la rotation (auto-assigne si non fourni)' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  order?: number;
}

export class RecordTontinePaymentDto {
  @ApiProperty({ description: 'ID du membre qui paie' })
  @IsUUID()
  memberId: string;

  @ApiProperty({ description: 'Montant paye' })
  @IsNumber()
  @Min(1)
  amount: number;
}

export class DisburseTontineRoundDto {
  // Pas de champs necessaires, declenche simplement le decaissement
}
