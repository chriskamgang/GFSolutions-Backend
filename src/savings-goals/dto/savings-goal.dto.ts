import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ContributionFrequency } from '@prisma/client';

export class CreateSavingsGoalDto {
  @ApiProperty({ description: 'ID du client' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ description: 'ID du compte epargne lie' })
  @IsUUID()
  savingsAccountId: string;

  @ApiProperty({ example: 'Scolarite enfants', description: 'Nom de l\'objectif' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 500000, description: 'Montant cible (FCFA)' })
  @IsNotEmpty()
  @IsNumber()
  targetAmount: number;

  @ApiProperty({ example: '2027-09-01', description: 'Date cible pour atteindre l\'objectif' })
  @IsNotEmpty()
  @IsDateString()
  targetDate: string;

  @ApiProperty({ required: false, default: false, description: 'Activer le debit automatique' })
  @IsOptional()
  @IsBoolean()
  autoDebit?: boolean;

  @ApiProperty({ required: false, example: 25000, description: 'Montant du debit automatique (FCFA)' })
  @IsOptional()
  @IsNumber()
  autoDebitAmount?: number;

  @ApiProperty({ required: false, enum: ContributionFrequency, description: 'Frequence du debit automatique' })
  @IsOptional()
  @IsEnum(ContributionFrequency)
  autoDebitFrequency?: ContributionFrequency;

  @ApiProperty({ required: false, default: 0, description: 'Taux bonus si objectif atteint (%)' })
  @IsOptional()
  @IsNumber()
  bonusRate?: number;
}

export class UpdateSavingsGoalDto extends PartialType(CreateSavingsGoalDto) {}

export class ContributeToGoalDto {
  @ApiProperty({ example: 10000, description: 'Montant a contribuer (FCFA)' })
  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
