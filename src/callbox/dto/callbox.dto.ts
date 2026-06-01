import {
  IsEmail, IsNotEmpty, IsString, IsOptional, IsUUID,
  IsNumber, IsPositive, Min, IsEnum, IsDecimal,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RegisterCallboxDto {
  @ApiProperty({ example: 'Marie Nguemo' })
  @IsNotEmpty() @IsString()
  ownerName: string;

  @ApiProperty({ example: 'Kiosque Marie Akwa', required: false })
  @IsOptional() @IsString()
  businessName?: string;

  @ApiProperty({ example: '+237699000001' })
  @IsNotEmpty() @IsString()
  phone: string;

  @ApiProperty({ example: 'marie.nguemo@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'motdepasse123' })
  @IsNotEmpty() @IsString()
  password: string;

  @ApiProperty({ example: 'Douala' })
  @IsNotEmpty() @IsString()
  city: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  address?: string;

  @ApiProperty()
  @IsUUID()
  agencyId: string;
}

export class CallboxLoginDto {
  @ApiProperty({ example: '+237699000001' })
  @IsNotEmpty() @IsString()
  phone: string;

  @ApiProperty()
  @IsNotEmpty() @IsString()
  password: string;
}

export class CallboxDepositDto {
  @ApiProperty({ description: 'QR code du client ou numero de compte' })
  @IsNotEmpty() @IsString()
  identifier: string;  // qrCode ou accountNumber

  @ApiProperty({ example: 10000 })
  @IsNumber() @IsPositive()
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;
}

export class CallboxWithdrawalDto {
  @ApiProperty()
  @IsNotEmpty() @IsString()
  identifier: string;

  @ApiProperty({ example: 5000 })
  @IsNumber() @IsPositive()
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;
}

export class CallboxTransferDto {
  @ApiProperty({ description: 'QR code ou numéro du destinataire' })
  @IsNotEmpty() @IsString()
  destIdentifier: string;

  @ApiProperty({ example: 15000 })
  @IsNumber() @IsPositive()
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;
}

export class FloatTopupDto {
  @ApiProperty()
  @IsUUID()
  callboxId: string;

  @ApiProperty({ example: 50000 })
  @IsNumber() @IsPositive()
  @Type(() => Number)
  amount: number;

  @ApiProperty({ example: 'CASH_AGENCY', enum: ['CASH_AGENCY', 'BANK_TRANSFER', 'AGENT'] })
  @IsNotEmpty() @IsString()
  method: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;
}

export class UpdateCommissionConfigDto {
  @ApiProperty({ description: 'Taux total commission (ex: 0.01 = 1%)' })
  @IsNumber()
  @Type(() => Number)
  rate: number;

  @ApiProperty({ description: 'Part callbox (ex: 0.30 = 30%)' })
  @IsNumber()
  @Type(() => Number)
  callboxShareRate: number;
}

export class ApproveCallboxDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  notes?: string;
}
