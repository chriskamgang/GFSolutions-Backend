import { IsString, IsNumber, IsOptional, IsIn, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAccountPlanDto {
  @ApiProperty({ example: '204', description: 'Code du compte (unique)' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Credits au personnel' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'ACTIF', enum: ['ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT'] })
  @IsString()
  @IsIn(['ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT'])
  type: string;

  @ApiProperty({ example: 3, description: 'Niveau hierarchique (1=classe, 2=compte, 3=sous-compte)' })
  @IsNumber()
  @Min(1)
  @Max(3)
  level: number;

  @ApiProperty({ example: '20', description: 'Code du compte parent', required: false })
  @IsOptional()
  @IsString()
  parentCode?: string;
}

export class UpdateAccountPlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @IsIn(['ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT']) type?: string;
  @IsOptional() @IsString() parentCode?: string;
}
