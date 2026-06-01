import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ContributionFrequency,
  MobileMoneyProvider,
} from '@prisma/client';

// ==================== PRODUITS D'EPARGNE ====================

export class CreateSavingsProductDto {
  @ApiProperty({ example: 'Epargne Libre' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'Epargne sans contrainte de depot' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 3.5, description: 'Taux d\'interet annuel (%)' })
  @IsNumber()
  interestRate: number;

  @ApiProperty({ example: 500, description: 'Depot minimum (FCFA)' })
  @IsNumber()
  minDeposit: number;

  @ApiProperty({ example: 0, description: 'Solde minimum a maintenir (FCFA)' })
  @IsNumber()
  minBalance: number;

  @ApiProperty({
    required: false,
    example: 0,
    description: 'Duree de blocage en mois (0 = libre)',
  })
  @IsOptional()
  @IsNumber()
  lockDurationMonths?: number;

  @ApiProperty({ required: false, description: 'Penalite retrait anticipe (%)' })
  @IsOptional()
  @IsNumber()
  earlyWithdrawalPenalty?: number;

  @ApiProperty({
    required: false,
    enum: ContributionFrequency,
    description: 'Frequence de cotisation obligatoire (null = libre)',
  })
  @IsOptional()
  @IsEnum(ContributionFrequency)
  contributionFrequency?: ContributionFrequency;

  @ApiProperty({
    required: false,
    example: 5000,
    description: 'Montant de cotisation obligatoire (FCFA)',
  })
  @IsOptional()
  @IsNumber()
  contributionAmount?: number;
}

// ==================== SOUSCRIPTION EPARGNE ====================

export class SubscribeSavingsDto {
  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsUUID()
  agencyId: string;

  @ApiProperty({ required: false, example: 10000, description: 'Depot initial (FCFA)' })
  @IsOptional()
  @IsNumber()
  initialDeposit?: number;
}

// ==================== DEPOT EPARGNE ====================

export class SavingsDepositDto {
  @ApiProperty()
  @IsUUID()
  savingsAccountId: string;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ required: false, enum: MobileMoneyProvider })
  @IsOptional()
  @IsEnum(MobileMoneyProvider)
  mobileMoneyProvider?: MobileMoneyProvider;

  @ApiProperty({ required: false, example: '+237690000000' })
  @IsOptional()
  @IsString()
  mobileMoneyPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  agencyId?: string;
}

// ==================== RETRAIT EPARGNE ====================

export class SavingsWithdrawalDto {
  @ApiProperty()
  @IsUUID()
  savingsAccountId: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ required: false, enum: MobileMoneyProvider })
  @IsOptional()
  @IsEnum(MobileMoneyProvider)
  mobileMoneyProvider?: MobileMoneyProvider;

  @ApiProperty({ required: false, example: '+237690000000' })
  @IsOptional()
  @IsString()
  mobileMoneyPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  agencyId?: string;
}

// ==================== CAISSE ====================

export class OpenCashRegisterDto {
  @ApiProperty()
  @IsUUID()
  agencyId: string;

  @ApiProperty({ example: 500000, description: 'Solde d\'ouverture de caisse (FCFA)' })
  @IsNumber()
  openingBalance: number;
}

export class CloseCashRegisterDto {
  @ApiProperty()
  @IsUUID()
  cashRegisterId: string;

  @ApiProperty({ example: 750000, description: 'Solde physique compte (FCFA)' })
  @IsNumber()
  physicalBalance: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
