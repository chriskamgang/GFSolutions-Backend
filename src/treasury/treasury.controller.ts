import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { TreasuryService } from './treasury.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateVaultDto, VaultMovementDto, ApproveVaultMovementDto, SetCashCeilingDto } from './dto/treasury.dto';

@ApiTags('Tresorerie')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @Get('position')
  @ApiOperation({ summary: 'Position de tresorerie consolidee' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'agencyId', required: false })
  getPosition(@Query('agencyId') agencyId?: string) {
    return this.treasuryService.getConsolidatedPosition(agencyId);
  }

  @Get('by-agency')
  @ApiOperation({ summary: 'Position par agence' })
  @Permissions('ACCOUNTING:READ')
  getByAgency() {
    return this.treasuryService.getPositionByAgency();
  }

  @Get('trend')
  @ApiOperation({ summary: 'Evolution depots/retraits sur 30 jours' })
  @Permissions('ACCOUNTING:READ')
  getTrend() {
    return this.treasuryService.getTrend();
  }

  // ==================== COFFRE-FORT ====================

  @Post('vaults')
  @Permissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Creer un coffre-fort pour une agence' })
  createVault(@Body() dto: CreateVaultDto) {
    return this.treasuryService.createVault(dto.agencyId, dto.initialBalance);
  }

  @Get('vaults')
  @Permissions('ACCOUNTING:READ')
  @ApiOperation({ summary: 'Liste des coffres-forts' })
  getVaults() {
    return this.treasuryService.getVaults();
  }

  @Get('vaults/agency/:agencyId')
  @Permissions('ACCOUNTING:READ')
  @ApiOperation({ summary: 'Coffre-fort d\'une agence avec historique' })
  getVaultByAgency(@Param('agencyId') agencyId: string) {
    return this.treasuryService.getVaultByAgency(agencyId);
  }

  @Post('vault-movements/deposit')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Demande de delestage caisse -> coffre' })
  requestDeposit(@Body() dto: VaultMovementDto, @CurrentUser() user: any) {
    return this.treasuryService.requestDepositToVault(dto.vaultId, dto.cashRegisterId, dto.amount, user.sub, dto.notes);
  }

  @Post('vault-movements/withdrawal')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Demande approvisionnement coffre -> caisse' })
  requestWithdrawal(@Body() dto: VaultMovementDto, @CurrentUser() user: any) {
    return this.treasuryService.requestWithdrawalFromVault(dto.vaultId, dto.cashRegisterId, dto.amount, user.sub, dto.notes);
  }

  @Get('vault-movements/pending')
  @Permissions('ACCOUNTING:READ')
  @ApiOperation({ summary: 'Mouvements coffre en attente de validation' })
  @ApiQuery({ name: 'agencyId', required: false })
  getPendingMovements(@Query('agencyId') agencyId?: string) {
    return this.treasuryService.getPendingMovements(agencyId);
  }

  @Post('vault-movements/:id/approve')
  @Permissions('TRANSACTIONS:UPDATE')
  @ApiOperation({ summary: 'Approuver ou rejeter un mouvement coffre' })
  approveMovement(
    @Param('id') id: string,
    @Body() dto: ApproveVaultMovementDto,
    @CurrentUser() user: any,
  ) {
    return this.treasuryService.approveVaultMovement(id, dto.approved, user.sub, dto.comment);
  }

  @Get('vault-movements')
  @Permissions('ACCOUNTING:READ')
  @ApiOperation({ summary: 'Historique des mouvements coffre' })
  @ApiQuery({ name: 'vaultId', required: false })
  @ApiQuery({ name: 'agencyId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getMovements(
    @Query('vaultId') vaultId?: string,
    @Query('agencyId') agencyId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.treasuryService.getVaultMovements({
      vaultId, agencyId, status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  // ==================== PLAFOND DE CAISSE ====================

  @Patch('cash-registers/:id/ceiling')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Definir le plafond d\'une caisse' })
  setCeiling(
    @Param('id') id: string,
    @Body() dto: SetCashCeilingDto,
    @CurrentUser() user: any,
  ) {
    return this.treasuryService.setCashCeiling(id, dto.cashCeiling, user.sub);
  }

  @Get('cash-ceiling/status')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Statut du plafond de caisse du caissier connecte' })
  getCeilingStatus(@CurrentUser() user: any) {
    return this.treasuryService.getCashCeilingStatus(user.sub);
  }
}
