import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCurrencyDto {
  @ApiProperty({ example: 'EUR' })
  code: string;

  @ApiProperty({ example: 'Euro' })
  name: string;

  @ApiProperty({ example: '€' })
  symbol: string;

  @ApiPropertyOptional({ example: 2 })
  decimals?: number;
}

export class UpdateCurrencyDto {
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() symbol?: string;
  @ApiPropertyOptional() decimals?: number;
  @ApiPropertyOptional() isActive?: boolean;
}

export class CreateExchangeRateDto {
  @ApiProperty({ description: 'Code devise source', example: 'EUR' })
  fromCurrency: string;

  @ApiProperty({ description: 'Code devise cible', example: 'XAF' })
  toCurrency: string;

  @ApiProperty({ description: 'Taux de change (1 source = X cible)', example: 655.957 })
  rate: number;

  @ApiPropertyOptional({ description: 'Taux achat', example: 653.0 })
  buyRate?: number;

  @ApiPropertyOptional({ description: 'Taux vente', example: 658.0 })
  sellRate?: number;

  @ApiPropertyOptional({ description: 'Frais de conversion %', example: 1.5 })
  feePercentage?: number;
}

export class ConvertCurrencyDto {
  @ApiProperty({ description: 'ID du compte principal' })
  accountId: string;

  @ApiProperty({ description: 'Code devise source', example: 'XAF' })
  fromCurrency: string;

  @ApiProperty({ description: 'Code devise cible', example: 'EUR' })
  toCurrency: string;

  @ApiProperty({ description: 'Montant dans la devise source', example: 100000 })
  amount: number;
}

export class CreateSubAccountDto {
  @ApiProperty({ description: 'ID du compte principal' })
  accountId: string;

  @ApiProperty({ description: 'Code devise', example: 'EUR' })
  currencyCode: string;
}
