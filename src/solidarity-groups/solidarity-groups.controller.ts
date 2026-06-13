import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SolidarityGroupsService } from './solidarity-groups.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Groupes Solidaires')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('solidarity-groups')
export class SolidarityGroupsController {
  constructor(private readonly service: SolidarityGroupsService) {}

  // POST /solidarity-groups
  @Post()
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Créer un groupe solidaire' })
  create(
    @Body()
    body: {
      name: string;
      code: string;
      description?: string;
      agencyId: string;
      presidentId: string;
      treasurerId?: string;
      maxMembers?: number;
      minMembers?: number;
    },
  ) {
    return this.service.create(body);
  }

  // GET /solidarity-groups
  @Get()
  @Permissions('CLIENTS:READ')
  @ApiOperation({ summary: 'Lister les groupes solidaires' })
  @ApiQuery({ name: 'agencyId', required: false })
  findAll(@Query('agencyId') agencyId?: string) {
    return this.service.findAll(agencyId);
  }

  // GET /solidarity-groups/:id
  @Get(':id')
  @Permissions('CLIENTS:READ')
  @ApiOperation({ summary: "Détail d'un groupe solidaire" })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // POST /solidarity-groups/:id/members
  @Post(':id/members')
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Ajouter un membre au groupe' })
  addMember(
    @Param('id') groupId: string,
    @Body() body: { clientId: string; role?: string },
  ) {
    return this.service.addMember(groupId, body.clientId, body.role);
  }

  // DELETE /solidarity-groups/:id/members/:clientId
  @Delete(':id/members/:clientId')
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Retirer un membre du groupe' })
  @HttpCode(HttpStatus.OK)
  removeMember(
    @Param('id') groupId: string,
    @Param('clientId') clientId: string,
  ) {
    return this.service.removeMember(groupId, clientId);
  }

  // PATCH /solidarity-groups/:id/dissolve
  @Patch(':id/dissolve')
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Dissoudre un groupe solidaire' })
  dissolve(@Param('id') id: string) {
    return this.service.dissolve(id);
  }

  // PATCH /solidarity-groups/:id/suspend
  @Patch(':id/suspend')
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Suspendre un groupe solidaire' })
  suspend(@Param('id') id: string) {
    return this.service.suspend(id);
  }

  // PATCH /solidarity-groups/:id/reactivate
  @Patch(':id/reactivate')
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Réactiver un groupe solidaire suspendu' })
  reactivate(@Param('id') id: string) {
    return this.service.reactivate(id);
  }
}
