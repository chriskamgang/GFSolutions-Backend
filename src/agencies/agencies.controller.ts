import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AgenciesService } from './agencies.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Agences')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('agencies')
export class AgenciesController {
  constructor(private agenciesService: AgenciesService) {}

  @Post()
  @Permissions('AGENCIES:CREATE')
  @ApiOperation({ summary: 'Creer une agence' })
  create(
    @Body()
    body: {
      name: string;
      code: string;
      address: string;
      city: string;
      region: string;
      phone: string;
      email?: string;
      parentId?: string;
    },
  ) {
    return this.agenciesService.create(body);
  }

  @Get()
  @Permissions('AGENCIES:READ')
  @ApiOperation({ summary: 'Lister les agences' })
  findAll() {
    return this.agenciesService.findAll();
  }

  @Get('consolidated/view')
  @Permissions('AGENCIES:READ')
  @ApiOperation({ summary: 'Vue consolidee de toutes les agences (siege)' })
  getConsolidatedView() {
    return this.agenciesService.getConsolidatedView();
  }

  @Get('settings/global')
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Parametres centralises depuis le siege' })
  getGlobalSettings() {
    return this.agenciesService.getGlobalSettings();
  }

  @Get(':id')
  @Permissions('AGENCIES:READ')
  @ApiOperation({ summary: 'Detail d\'une agence' })
  findOne(@Param('id') id: string) {
    return this.agenciesService.findOne(id);
  }

  @Patch(':id')
  @Permissions('AGENCIES:UPDATE')
  @ApiOperation({ summary: 'Modifier une agence' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.agenciesService.update(id, body);
  }

  @Post('inter-agency-transfer')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Transfert inter-agences' })
  interAgencyTransfer(
    @Body() body: { fromAccountId: string; toAccountId: string; amount: number; notes?: string },
    @CurrentUser() user: any,
  ) {
    return this.agenciesService.interAgencyTransfer(body, user.sub);
  }
}
