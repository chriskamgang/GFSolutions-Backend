import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateCreditDto {
  @ApiProperty({ description: 'Approuver ou rejeter' })
  @IsBoolean()
  approved: boolean;

  @ApiProperty({ description: 'Commentaire', required: false })
  @IsOptional()
  @IsString()
  comment?: string;
}
