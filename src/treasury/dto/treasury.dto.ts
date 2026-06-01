import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, IsBoolean, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVaultDto {
  @ApiProperty({ description: 'ID de l\'agence' })
  @IsUUID()
  @IsNotEmpty()
  agencyId: string;

  @ApiProperty({ description: 'Solde initial du coffre', default: 0 })
  @IsNumber()
  @IsOptional()
  initialBalance?: number;
}

export class VaultMovementDto {
  @ApiProperty({ description: 'ID du coffre-fort' })
  @IsUUID()
  @IsNotEmpty()
  vaultId: string;

  @ApiProperty({ description: 'ID de la caisse source/destination' })
  @IsUUID()
  @IsNotEmpty()
  cashRegisterId: string;

  @ApiProperty({ description: 'Montant du mouvement en FCFA' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Notes optionnelles' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ApproveVaultMovementDto {
  @ApiProperty({ description: 'Approuver (true) ou rejeter (false)' })
  @IsBoolean()
  approved: boolean;

  @ApiProperty({ description: 'Motif de rejet (si rejete)' })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class SetCashCeilingDto {
  @ApiProperty({ description: 'Plafond de caisse en FCFA (null pour supprimer)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cashCeiling: number | null;
}
