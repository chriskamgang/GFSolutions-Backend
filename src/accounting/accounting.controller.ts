import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AccountingService } from './accounting.service';
import { CreateAccountPlanDto, UpdateAccountPlanDto } from './dto/accounting.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Comptabilite SYSCOHADA')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('plan/seed')
  @ApiOperation({ summary: 'Initialiser le plan comptable EMF SYSCOHADA' })
  @Permissions('ACCOUNTING:CREATE')
  seedPlan() {
    return this.accountingService.seedAccountPlan();
  }

  @Get('plan')
  @ApiOperation({ summary: 'Plan comptable EMF' })
  @Permissions('ACCOUNTING:READ')
  getPlan() {
    return this.accountingService.getAccountPlan();
  }

  @Post('plan')
  @ApiOperation({ summary: 'Ajouter un compte au plan comptable' })
  @Permissions('ACCOUNTING:CREATE')
  createAccountPlan(@Body() dto: CreateAccountPlanDto) {
    return this.accountingService.createAccountPlanEntry(dto);
  }

  @Patch('plan/:code')
  @ApiOperation({ summary: 'Modifier un compte du plan comptable' })
  @Permissions('ACCOUNTING:UPDATE')
  updateAccountPlan(@Param('code') code: string, @Body() dto: UpdateAccountPlanDto) {
    return this.accountingService.updateAccountPlanEntry(code, dto);
  }

  @Delete('plan/:code')
  @ApiOperation({ summary: 'Supprimer un compte du plan comptable (si aucune ecriture liee)' })
  @Permissions('ACCOUNTING:DELETE')
  deleteAccountPlan(@Param('code') code: string) {
    return this.accountingService.deleteAccountPlanEntry(code);
  }

  @Get('journal')
  @ApiOperation({ summary: 'Journal des ecritures comptables' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'accountCode', required: false })
  getJournal(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('accountCode') accountCode?: string,
    @Query('agencyId') agencyId?: string,
  ) {
    return this.accountingService.getJournal({
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      startDate, endDate, accountCode, agencyId,
    });
  }

  @Get('journal-auxiliaire')
  @ApiOperation({ summary: 'Journal auxiliaire (Caisse, Banque, OD)' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'type', required: true, enum: ['CAISSE', 'BANQUE', 'OD'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getJournalAuxiliaire(
    @Query('type') type: 'CAISSE' | 'BANQUE' | 'OD',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accountingService.getJournalAuxiliaire({
      type: type || 'CAISSE',
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      startDate, endDate,
    });
  }

  @Get('grand-livre/:code')
  @ApiOperation({ summary: 'Grand livre d\'un compte (toutes les ecritures)' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getGrandLivre(
    @Param('code') code: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountingService.getGrandLivre(code, {
      startDate, endDate,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    });
  }

  @Get('balance')
  @ApiOperation({ summary: 'Balance des comptes' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getBalance(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accountingService.getBalance(startDate, endDate);
  }

  @Get('bilan')
  @ApiOperation({ summary: 'Bilan SYSCOHADA EMF (Actif / Passif)' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getBilan(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accountingService.getBilan(startDate, endDate);
  }

  @Get('compte-resultat')
  @ApiOperation({ summary: 'Compte de resultat SYSCOHADA EMF (Charges / Produits)' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getCompteResultat(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accountingService.getCompteResultat(startDate, endDate);
  }

  @Get('flux-tresorerie')
  @ApiOperation({ summary: 'Flux de tresorerie SYSCOHADA EMF (Exploitation, Investissement, Financement)' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getFluxTresorerie(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accountingService.getFluxTresorerie(startDate, endDate);
  }

  @Get('periods')
  @ApiOperation({ summary: 'Periodes comptables' })
  @Permissions('ACCOUNTING:READ')
  getPeriods() {
    return this.accountingService.getPeriods();
  }

  @Post('periods')
  @ApiOperation({ summary: 'Creer une periode comptable' })
  @Permissions('ACCOUNTING:CREATE')
  createPeriod(@Body() body: { name: string; startDate: string; endDate: string }) {
    return this.accountingService.createPeriod(body);
  }

  @Patch('periods/:id/close')
  @ApiOperation({ summary: 'Cloturer une periode comptable (journaliere/mensuelle)' })
  @Permissions('ACCOUNTING:UPDATE')
  closePeriod(@Param('id') id: string, @CurrentUser() user: any) {
    return this.accountingService.closePeriod(id, user.sub);
  }

  @Get('periods/:id/stats')
  @ApiOperation({ summary: 'Statistiques d\'une periode (ecritures, totaux, equilibre)' })
  @Permissions('ACCOUNTING:READ')
  getPeriodStats(@Param('id') id: string) {
    return this.accountingService.getPeriodStats(id);
  }

  @Patch('periods/:id/close-annual')
  @ApiOperation({ summary: 'Cloture annuelle avec ecriture de resultat' })
  @Permissions('ACCOUNTING:UPDATE')
  closeAnnualPeriod(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { agencyId: string },
  ) {
    return this.accountingService.closeAnnualPeriod(id, user.sub, body.agencyId);
  }

  // ==================== CLOTURES JOURNALIERE & MENSUELLE ====================

  @Post('close-daily')
  @ApiOperation({ summary: 'Cloture journaliere (EOD) - verifie caisses, equilibre, verrouille' })
  @Permissions('ACCOUNTING:UPDATE')
  closeDailyPeriod(
    @Body() body: { date: string; agencyId?: string },
    @CurrentUser() user: any,
  ) {
    return this.accountingService.closeDailyPeriod(body.date, user.sub, body.agencyId);
  }

  @Post('close-monthly')
  @ApiOperation({ summary: 'Cloture mensuelle - balance, frais, verrouillage' })
  @Permissions('ACCOUNTING:UPDATE')
  closeMonthlyPeriod(
    @Body() body: { year: number; month: number; agencyId: string },
    @CurrentUser() user: any,
  ) {
    return this.accountingService.closeMonthlyPeriod(body.year, body.month, user.sub, body.agencyId);
  }

  // ==================== RAPPROCHEMENT BANCAIRE ====================

  @Post('bank-statement/import')
  @ApiOperation({ summary: 'Importer des lignes de releve bancaire' })
  @Permissions('ACCOUNTING:CREATE')
  importBankStatement(@Body() body: { lines: any[] }) {
    return this.accountingService.importBankStatementLines(body.lines);
  }

  @Get('bank-statement')
  @ApiOperation({ summary: 'Lignes du releve bancaire' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'matched', required: false })
  getBankStatement(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('matched') matched?: string,
  ) {
    return this.accountingService.getBankStatementLines({ startDate, endDate, matched });
  }

  @Delete('bank-statement/:id')
  @ApiOperation({ summary: 'Supprimer une ligne de releve bancaire' })
  @Permissions('ACCOUNTING:DELETE')
  deleteBankLine(@Param('id') id: string) {
    return this.accountingService.deleteBankLine(id);
  }

  @Post('reconciliation/auto')
  @ApiOperation({ summary: 'Rapprochement automatique (match par montant + date)' })
  @Permissions('ACCOUNTING:UPDATE')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  autoReconcile(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accountingService.autoReconcile(startDate, endDate);
  }

  @Post('reconciliation/match')
  @ApiOperation({ summary: 'Rapprochement manuel' })
  @Permissions('ACCOUNTING:UPDATE')
  manualMatch(@Body() body: { bankLineId: string; journalEntryId: string }) {
    return this.accountingService.manualMatch(body.bankLineId, body.journalEntryId);
  }

  @Post('reconciliation/unmatch/:id')
  @ApiOperation({ summary: 'Annuler un rapprochement' })
  @Permissions('ACCOUNTING:UPDATE')
  unmatch(@Param('id') id: string) {
    return this.accountingService.unmatch(id);
  }

  @Get('reconciliation/summary')
  @ApiOperation({ summary: 'Synthese du rapprochement bancaire' })
  @Permissions('ACCOUNTING:READ')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getReconciliationSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accountingService.getReconciliationSummary(startDate, endDate);
  }
}
