import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AmlService } from './aml.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('LAB/FT (Anti-blanchiment)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('aml')
export class AmlController {
  constructor(private readonly amlService: AmlService) {}

  @Get()
  @Permissions('REPORTS:READ')
  @ApiOperation({ summary: 'Lister les alertes LAB/FT' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'riskLevel', required: false })
  @ApiQuery({ name: 'alertType', required: false })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('alertType') alertType?: string,
    @Query('clientId') clientId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.amlService.findAll({
      status, riskLevel, alertType, clientId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('stats')
  @Permissions('REPORTS:READ')
  @ApiOperation({ summary: 'Statistiques LAB/FT' })
  getStats() {
    return this.amlService.getStats();
  }

  @Get(':id')
  @Permissions('REPORTS:READ')
  @ApiOperation({ summary: 'Detail d\'une alerte LAB/FT' })
  findOne(@Param('id') id: string) {
    return this.amlService.findOne(id);
  }

  @Patch(':id/status')
  @Permissions('REPORTS:READ')
  @ApiOperation({ summary: 'Mettre a jour le statut d\'une alerte' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: { status: string; investigationNotes?: string; resolution?: string; assignedToId?: string },
    @CurrentUser() user: any,
  ) {
    return this.amlService.updateStatus(id, dto, user.sub);
  }

  @Post(':id/report')
  @Permissions('REPORTS:READ')
  @ApiOperation({ summary: 'Declarer une alerte a l\'ANIF' })
  reportToAuthority(@Param('id') id: string, @CurrentUser() user: any) {
    return this.amlService.reportToAuthority(id, user.sub);
  }
}
