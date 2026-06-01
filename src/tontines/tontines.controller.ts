import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TontinesService } from './tontines.service';
import {
  CreateTontineGroupDto,
  AddTontineMemberDto,
  RecordTontinePaymentDto,
} from './dto/tontine.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Tontines')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('tontines')
export class TontinesController {
  constructor(private tontinesService: TontinesService) {}

  @Post()
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Creer un groupe tontine' })
  createGroup(@Body() dto: CreateTontineGroupDto, @CurrentUser() user: any) {
    return this.tontinesService.createGroup(dto, user.sub);
  }

  @Get()
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Lister les groupes tontine' })
  @ApiQuery({ name: 'agencyId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAllGroups(
    @Query('agencyId') agencyId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tontinesService.findAllGroups({
      agencyId,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get(':id')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Detail d\'un groupe tontine avec membres et tours' })
  findOneGroup(@Param('id') id: string) {
    return this.tontinesService.findOneGroup(id);
  }

  @Post(':id/members')
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Ajouter un membre au groupe tontine' })
  addMember(
    @Param('id') id: string,
    @Body() dto: AddTontineMemberDto,
    @CurrentUser() user: any,
  ) {
    return this.tontinesService.addMember(id, dto, user.sub);
  }

  @Delete(':id/members/:memberId')
  @Permissions('CONTRIBUTIONS:DELETE')
  @ApiOperation({ summary: 'Retirer un membre du groupe (desactivation)' })
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: any,
  ) {
    return this.tontinesService.removeMember(id, memberId, user.sub);
  }

  @Post(':id/rounds/:roundId/payment')
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Enregistrer le paiement d\'un membre pour un tour' })
  recordPayment(
    @Param('id') id: string,
    @Param('roundId') roundId: string,
    @Body() dto: RecordTontinePaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.tontinesService.recordPayment(id, roundId, dto, user.sub);
  }

  @Post(':id/rounds/:roundId/disburse')
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Decaisser le tour au beneficiaire' })
  disburseRound(
    @Param('id') id: string,
    @Param('roundId') roundId: string,
    @CurrentUser() user: any,
  ) {
    return this.tontinesService.disburseRound(id, roundId, user.sub);
  }

  @Get(':id/rounds/:roundId/status')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Statut des paiements pour un tour' })
  getPaymentStatus(
    @Param('id') id: string,
    @Param('roundId') roundId: string,
  ) {
    return this.tontinesService.getPaymentStatus(id, roundId);
  }
}
