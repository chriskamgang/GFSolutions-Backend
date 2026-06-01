import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class GuaranteeDto {
  @ApiProperty({ example: 'REAL_ESTATE' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'Terrain a Douala, Akwa' })
  @IsString()
  description: string;

  @ApiProperty({ example: 5000000 })
  @IsNumber()
  @Min(0)
  value: number;
}

export class CreateCreditDto {
  @ApiProperty({ description: 'ID du client' })
  @IsString()
  clientId: string;

  @ApiProperty({ description: 'Montant du credit en FCFA', example: 1000000 })
  @IsNumber()
  @Min(50000)
  amount: number;

  @ApiProperty({ description: 'Taux d\'interet annuel (%)', example: 12 })
  @IsNumber()
  @Min(1)
  @Max(50)
  interestRate: number;

  @ApiProperty({ description: 'Duree en mois', example: 12 })
  @IsNumber()
  @Min(1)
  @Max(60)
  durationMonths: number;

  @ApiProperty({ description: 'Objet du credit', example: 'Achat materiel agricole' })
  @IsString()
  purpose: string;

  @ApiProperty({ description: 'Type de credit', example: 'PERSONNEL', required: false })
  @IsOptional()
  @IsString()
  creditType?: string;

  @ApiProperty({ description: 'Garanties', required: false, type: [GuaranteeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuaranteeDto)
  guarantees?: GuaranteeDto[];
}
