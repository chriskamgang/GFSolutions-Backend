import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('Rapports & KPIs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'KPIs globaux et ratios prudentiels COBAC' })
  @Permissions('REPORTS:READ')
  getKPIs() {
    return this.reportsService.getKPIs();
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Rapport mensuel' })
  @Permissions('REPORTS:READ')
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  getMonthly(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    return this.reportsService.getMonthlyReport(
      year ? +year : now.getFullYear(),
      month ? +month : now.getMonth() + 1,
    );
  }

  @Get('yearly-trend')
  @ApiOperation({ summary: 'Evolution sur 12 mois' })
  @Permissions('REPORTS:READ')
  getYearlyTrend() {
    return this.reportsService.getYearlyTrend();
  }

  @Get('cobac')
  @ApiOperation({ summary: 'Rapport reglementaire COBAC (ratios prudentiels, situation patrimoniale, qualite portefeuille)' })
  @Permissions('REPORTS:READ')
  getCOBACReport() {
    return this.reportsService.getCOBACReport();
  }

  @Get('enriched-kpis')
  @ApiOperation({ summary: 'KPIs enrichis (cotisations, tontines, revenus detailles)' })
  @Permissions('REPORTS:READ')
  getEnrichedKPIs() {
    return this.reportsService.getEnrichedKPIs();
  }

  @Get('by-agency')
  @ApiOperation({ summary: 'Rapport par agence' })
  @Permissions('REPORTS:READ')
  @ApiQuery({ name: 'agencyId', required: true })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  getByAgency(
    @Query('agencyId') agencyId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reportsService.getReportByAgency(
      agencyId,
      year ? +year : undefined,
      month ? +month : undefined,
    );
  }

  @Get('daily')
  @ApiOperation({ summary: 'Rapport journalier' })
  @Permissions('REPORTS:READ')
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD (defaut: aujourd\'hui)' })
  getDailyReport(@Query('date') date?: string) {
    return this.reportsService.getDailyReport(date);
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Rapport hebdomadaire' })
  @Permissions('REPORTS:READ')
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD (defaut: lundi de la semaine en cours)' })
  getWeeklyReport(@Query('startDate') startDate?: string) {
    return this.reportsService.getWeeklyReport(startDate);
  }

  @Get('account-openings')
  @ApiOperation({ summary: 'Rapport des ouvertures de comptes et frais collectes' })
  @Permissions('REPORTS:READ')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getAccountOpenings(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getAccountOpeningsReport(startDate, endDate);
  }

  @Get('provisioning')
  @Permissions('REPORTS:READ')
  @ApiOperation({ summary: 'Calcul provisionnement creances douteuses (normes COBAC)' })
  @ApiQuery({ name: 'agencyId', required: false })
  getProvisioning(@Query('agencyId') agencyId?: string) {
    return this.reportsService.calculateProvisioning(agencyId);
  }

  @Get('tafire')
  @Permissions('REPORTS:READ')
  @ApiOperation({ summary: 'TAFIRE - Tableau Financier des Ressources et Emplois (OHADA)' })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'agencyId', required: false })
  getTafire(@Query('year') year: string, @Query('agencyId') agencyId?: string) {
    return this.reportsService.generateTafire(parseInt(year) || new Date().getFullYear(), agencyId);
  }

  @Get('cobac/excel')
  @Permissions('REPORTS:READ')
  @ApiOperation({ summary: 'Telecharger le rapport COBAC complet au format Excel (xlsx)' })
  async getCobacExcel(@Res() res: any) {
    const buffer = await this.reportsService.generateCobacExcel();
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Rapport_COBAC_${date}.xlsx`);
    res.send(buffer);
  }
}
