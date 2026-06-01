import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsNumber,
  IsIn,
  IsOptional,
} from 'class-validator';

export class RequestCheckbookDto {
  @ApiProperty({ description: 'ID du compte', example: 'uuid-du-compte' })
  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({ description: 'Nombre de feuilles (25 ou 50)', example: 25 })
  @IsNumber()
  @IsIn([25, 50, 100])
  totalLeaves: number;
}

export class EmitChequeDto {
  @ApiProperty({ description: 'Numero du cheque', example: 'CHQ-000001' })
  @IsString()
  @IsNotEmpty()
  chequeNumber: string;

  @ApiProperty({ description: 'Montant du cheque', example: 150000 })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: 'Beneficiaire', example: 'Jean Dupont' })
  @IsString()
  @IsNotEmpty()
  beneficiary: string;
}

export class OppositionChequeDto {
  @ApiProperty({
    description: 'Motif de l\'opposition',
    enum: ['PERTE', 'VOL', 'LITIGE'],
    example: 'PERTE',
  })
  @IsString()
  @IsIn(['PERTE', 'VOL', 'LITIGE'])
  @IsNotEmpty()
  motif: string;
}

export class EncaisserChequeDto {
  @ApiProperty({ description: 'Numero du cheque', example: 'CHQ-000001' })
  @IsString()
  @IsNotEmpty()
  chequeNumber: string;

  @ApiPropertyOptional({ description: 'ID du compte destination (virement par cheque). Laisser vide pour retrait especes.', example: 'uuid-du-compte' })
  @IsUUID()
  @IsOptional()
  accountId?: string;
}

export class RetraitChequeDto {
  @ApiProperty({ description: 'Numero du cheque', example: 'CHQ-000001' })
  @IsString()
  @IsNotEmpty()
  chequeNumber: string;
}
