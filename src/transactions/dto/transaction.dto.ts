import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsUUID,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MobileMoneyProvider } from '@prisma/client';

export class DepositDto {
  @ApiProperty()
  @IsUUID()
  toAccountId: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: MobileMoneyProvider, required: false })
  @IsOptional()
  @IsEnum(MobileMoneyProvider)
  mobileMoneyProvider?: MobileMoneyProvider;

  @ApiProperty({ example: '+237690000000', required: false })
  @IsOptional()
  @IsString()
  mobileMoneyPhone?: string;

  @ApiProperty()
  @IsUUID()
  agencyId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  // Signataire pour comptes Personne Morale
  @ApiProperty({ required: false, description: 'ID du mandataire/signataire (obligatoire pour Personne Morale)' })
  @IsOptional()
  @IsUUID()
  signataireId?: string;

  @ApiProperty({ required: false, description: 'Confirmation que identite et signature ont ete verifiees' })
  @IsOptional()
  @IsBoolean()
  signataireVerifie?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'IDs des signataires (requis pour signature conjointe JOINT)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  signataireIds?: string[];
}

export class WithdrawalDto {
  @ApiProperty()
  @IsUUID()
  fromAccountId: string;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: MobileMoneyProvider, required: false })
  @IsOptional()
  @IsEnum(MobileMoneyProvider)
  mobileMoneyProvider?: MobileMoneyProvider;

  @ApiProperty({ example: '+237690000000', required: false })
  @IsOptional()
  @IsString()
  mobileMoneyPhone?: string;

  @ApiProperty()
  @IsUUID()
  agencyId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  // Signataire pour comptes Personne Morale
  @ApiProperty({ required: false, description: 'ID du mandataire/signataire (obligatoire pour Personne Morale)' })
  @IsOptional()
  @IsUUID()
  signataireId?: string;

  @ApiProperty({ required: false, description: 'Confirmation que identite et signature ont ete verifiees' })
  @IsOptional()
  @IsBoolean()
  signataireVerifie?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'IDs des signataires (requis pour signature conjointe JOINT)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  signataireIds?: string[];
}

export class TransferDto {
  @ApiProperty()
  @IsUUID()
  fromAccountId: string;

  @ApiProperty()
  @IsUUID()
  toAccountId: string;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  amount: number;

  @ApiProperty()
  @IsUUID()
  agencyId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  // Signataire pour comptes Personne Morale
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  signataireId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  signataireVerifie?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'IDs des signataires (requis pour signature conjointe JOINT)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  signataireIds?: string[];
}

export class ExternalTransferDto {
  @ApiProperty()
  @IsUUID()
  fromAccountId: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'Afriland First Bank' })
  @IsNotEmpty()
  @IsString()
  destinationBank: string;

  @ApiProperty({ example: '10025-00001-00012345678-90' })
  @IsNotEmpty()
  @IsString()
  destinationAccountNumber: string;

  @ApiProperty({ example: 'Jean Dupont' })
  @IsNotEmpty()
  @IsString()
  beneficiaryName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  motif?: string;

  @ApiProperty()
  @IsUUID()
  agencyId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  signataireId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  signataireVerifie?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'IDs des signataires (requis pour signature conjointe JOINT)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  signataireIds?: string[];
}

export class ApproveExternalTransferDto {
  @ApiProperty()
  @IsBoolean()
  approved: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comment?: string;
}
