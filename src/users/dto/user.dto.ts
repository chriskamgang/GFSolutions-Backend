import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Language } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'jean.kamga@gfs-cameroun.com' })
  @IsEmail()
  @Matches(/@gfs-cameroun\.com$/, { message: 'L\'email doit être un email professionnel GFS (@gfs-cameroun.com)' })
  email: string;

  @ApiProperty({ example: '+237690000000' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: 'motdepasse123' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({ example: 'Jean' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsUUID()
  roleId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  agencyId?: string;

  @ApiProperty({ enum: Language, default: 'FR' })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

/** Utilitaire : génère l'email professionnel GFS à partir du prénom/nom */
export function generateGfsEmail(firstName: string, lastName: string): string {
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.-]/g, '');
  return `${normalize(firstName)}.${normalize(lastName)}@gfs-cameroun.com`;
}
