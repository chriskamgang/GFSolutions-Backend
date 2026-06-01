import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SimulateCreditDto {
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

  @ApiProperty({ description: 'Type: CONSTANT (annuite constante) ou DEGRESSIVE (amortissement constant)', example: 'CONSTANT', required: false })
  @IsOptional()
  @IsString()
  repaymentType?: 'CONSTANT' | 'DEGRESSIVE';
}
