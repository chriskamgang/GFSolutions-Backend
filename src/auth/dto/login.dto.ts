import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@microfinance.cm' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'motdepasse123' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({ description: 'Code TOTP 2FA (si active)', required: false, example: '123456' })
  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  oldPassword: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  newPassword: string;
}

export class Verify2FADto {
  @ApiProperty({ description: 'Code TOTP a 6 chiffres', example: '123456' })
  @IsNotEmpty()
  @IsString()
  totpCode: string;
}
