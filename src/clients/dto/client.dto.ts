import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsEmail,
  IsBoolean,
  IsUUID,
  IsNumber,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  Gender,
  IdDocumentType,
  Language,
  ClientType,
  FormeJuridique,
  MandataireRole,
  SignatureRule,
} from '@prisma/client';

export class CreateClientDto {
  @ApiProperty({ enum: ClientType, default: 'PHYSIQUE' })
  @IsEnum(ClientType)
  clientType: ClientType;

  // === Champs communs ===

  @ApiProperty({ example: '+237690000000' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Rue 1234, Douala' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ example: 'Douala' })
  @IsNotEmpty()
  @IsString()
  city: string;

  @ApiProperty({ example: 'Littoral' })
  @IsNotEmpty()
  @IsString()
  region: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  agencyId?: string;

  @ApiProperty({ enum: Language, default: 'FR' })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  // === Personne Physique ===

  @ApiProperty({ example: 'Jean', required: false })
  @ValidateIf((o) => o.clientType === 'PHYSIQUE')
  @IsNotEmpty()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Kamga', required: false })
  @ValidateIf((o) => o.clientType === 'PHYSIQUE')
  @IsNotEmpty()
  @IsString()
  lastName?: string;

  @ApiProperty({ enum: Gender, required: false })
  @ValidateIf((o) => o.clientType === 'PHYSIQUE')
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ example: '1990-05-15', required: false })
  @ValidateIf((o) => o.clientType === 'PHYSIQUE')
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lieuNaissance?: string;

  @ApiProperty({ enum: IdDocumentType, required: false })
  @ValidateIf((o) => o.clientType === 'PHYSIQUE')
  @IsEnum(IdDocumentType)
  idDocumentType?: IdDocumentType;

  @ApiProperty({ example: '123456789', required: false })
  @ValidateIf((o) => o.clientType === 'PHYSIQUE')
  @IsNotEmpty()
  @IsString()
  idDocumentNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idDocumentPhoto?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateExpirationPiece?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  profilePhoto?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  signatureData?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  signatureData2?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  signatureData3?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPEP?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  secteurActivite?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  revenuMensuel?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phoneSecondaire?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  // === Personne Morale ===

  @ApiProperty({ required: false })
  @ValidateIf((o) => o.clientType === 'MORALE')
  @IsNotEmpty()
  @IsString()
  raisonSociale?: string;

  @ApiProperty({ enum: FormeJuridique, required: false })
  @ValidateIf((o) => o.clientType === 'MORALE')
  @IsEnum(FormeJuridique)
  formeJuridique?: FormeJuridique;

  @ApiProperty({ required: false })
  @ValidateIf((o) => o.clientType === 'MORALE')
  @IsNotEmpty()
  @IsString()
  numeroEnregistrement?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  identifiantFiscal?: string;

  @ApiProperty({ required: false })
  @ValidateIf((o) => o.clientType === 'MORALE')
  @IsDateString()
  dateConstitution?: string;

  @ApiProperty({ enum: SignatureRule, default: 'SINGLE', required: false })
  @IsOptional()
  @IsEnum(SignatureRule)
  signatureRule?: SignatureRule;
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class AddMandataireDto {
  @ApiProperty({ description: 'ID du client personne physique' })
  @IsUUID()
  clientPhysiqueId: string;

  @ApiProperty({ enum: MandataireRole })
  @IsEnum(MandataireRole)
  role: MandataireRole;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  isSignataire?: boolean;

  @ApiProperty({ required: false, description: 'Plafond maximum par operation pour ce mandataire (FCFA)' })
  @IsOptional()
  @IsNumber()
  maxOperationAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  documentUrl?: string;
}
