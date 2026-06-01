import { IsNotEmpty, IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClientLoginDto {
  @ApiProperty({ description: 'Telephone ou code adherent', example: '+237691234567' })
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({ description: 'Mot de passe ou code PIN', example: '1234' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({ description: 'Code TOTP 2FA (si active)', required: false })
  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class ClientRegisterPinDto {
  @ApiProperty({ description: 'Code PIN a 4 ou 6 chiffres', example: '1234' })
  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  @Matches(/^\d{4,6}$/, { message: 'Le PIN doit contenir 4 a 6 chiffres' })
  pin: string;

  @ApiProperty({ description: 'Mot de passe (min 6 caracteres)', example: 'MonMdp@2024' })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;
}

export class ClientChangePinDto {
  @ApiProperty({ example: '1234' })
  @IsNotEmpty()
  @IsString()
  oldPin: string;

  @ApiProperty({ example: '5678' })
  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  @Matches(/^\d{4,6}$/, { message: 'Le PIN doit contenir 4 a 6 chiffres' })
  newPin: string;
}

export class ClientChangePasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  oldPassword: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}
