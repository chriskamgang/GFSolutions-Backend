import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCreditProductDto {
  @ApiProperty({ example: 'Credit Personnel' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'CRED-PERSO' })
  @IsString()
  code: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(0)
  minAmount: number;

  @ApiProperty({ example: 10000000 })
  @IsNumber()
  @Min(0)
  maxAmount: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  minDurationMonths: number;

  @ApiProperty({ example: 36 })
  @IsNumber()
  @Min(1)
  maxDurationMonths: number;

  @ApiProperty({ example: 12, description: 'Taux annuel %' })
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate: number;

  @ApiProperty({ example: 'CONSTANT', required: false })
  @IsOptional()
  @IsString()
  repaymentType?: string;

  @ApiProperty({ example: 'PERCENTAGE', required: false })
  @IsOptional()
  @IsString()
  applicationFeeType?: string;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  @IsNumber()
  applicationFeeValue?: number;

  @ApiProperty({ example: 2, description: 'Taux assurance % du capital', required: false })
  @IsOptional()
  @IsNumber()
  insuranceRate?: number;

  @ApiProperty({ example: 0.1, description: 'Taux moratoire journalier %', required: false })
  @IsOptional()
  @IsNumber()
  latePaymentRate?: number;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber()
  gracePeriodMonths?: number;
}

export class UpdateCreditProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() minAmount?: number;
  @IsOptional() @IsNumber() maxAmount?: number;
  @IsOptional() @IsNumber() minDurationMonths?: number;
  @IsOptional() @IsNumber() maxDurationMonths?: number;
  @IsOptional() @IsNumber() interestRate?: number;
  @IsOptional() @IsString() repaymentType?: string;
  @IsOptional() @IsString() applicationFeeType?: string;
  @IsOptional() @IsNumber() applicationFeeValue?: number;
  @IsOptional() @IsNumber() insuranceRate?: number;
  @IsOptional() @IsNumber() latePaymentRate?: number;
  @IsOptional() @IsNumber() gracePeriodMonths?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EarlyRepaymentDto {
  @ApiProperty({ description: 'Montant du remboursement anticipe' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Remboursement total (true) ou partiel (false)', required: false })
  @IsOptional()
  @IsBoolean()
  isTotal?: boolean;
}
