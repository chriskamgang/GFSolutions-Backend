import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Post()
  @Permissions('ROLES:CREATE')
  @ApiOperation({ summary: 'Creer un role' })
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      maxTransactionAmount?: number;
      sessionTimeout?: number;
      permissionIds?: string[];
    },
  ) {
    return this.rolesService.create(body);
  }

  @Get()
  @Permissions('ROLES:READ')
  @ApiOperation({ summary: 'Lister les roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('permissions')
  @Permissions('ROLES:READ')
  @ApiOperation({ summary: 'Lister toutes les permissions disponibles' })
  getAllPermissions() {
    return this.rolesService.getAllPermissions();
  }

  @Get(':id')
  @Permissions('ROLES:READ')
  @ApiOperation({ summary: 'Detail d\'un role' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id/permissions')
  @Permissions('ROLES:UPDATE')
  @ApiOperation({ summary: 'Modifier les permissions d\'un role' })
  updatePermissions(
    @Param('id') id: string,
    @Body('permissionIds') permissionIds: string[],
  ) {
    return this.rolesService.updatePermissions(id, permissionIds);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Initialiser les roles et permissions par defaut' })
  seed() {
    return this.rolesService.seedDefaultRolesAndPermissions();
  }
}
