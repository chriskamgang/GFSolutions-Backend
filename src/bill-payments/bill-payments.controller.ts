import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BillPaymentsService, OPERATORS } from './bill-payments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Paiements de Factures')
@Controller('bill-payments')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class BillPaymentsController {
  constructor(private service: BillPaymentsService) {}

  @Get('operators')
  @ApiOperation({ summary: 'Liste des opérateurs disponibles' })
  getOperators() {
    return Object.entries(OPERATORS).map(([key, label]) => ({ key, label }));
  }

  @Get('kpis')
  @ApiOperation({ summary: 'KPIs globaux paiements factures' })
  getKpis(@Query('agencyId') agencyId?: string) {
    return this.service.getKpis(agencyId);
  }

  @Get('reversal-stats')
  @ApiOperation({ summary: 'Stats par opérateur pour bordereau de reversement' })
  getReversalStats(
    @Query('agencyId') agencyId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getReversalStats(agencyId, dateFrom, dateTo);
  }

  @Post()
  @ApiOperation({ summary: 'Enregistrer un paiement de facture (cash ou débit compte)' })
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: {
      operator: string;
      billNumber: string;
      payerName: string;
      payerPhone?: string;
      amount: number;
      fees?: number;
      paymentMode: 'CASH' | 'ACCOUNT';
      accountId?: string;
      agencyId: string;
      notes?: string;
    },
  ) {
    return this.service.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Liste des paiements avec filtres' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('agencyId') agencyId?: string,
    @Query('operator') operator?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      agencyId,
      operator,
      status,
      dateFrom,
      dateTo,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un paiement' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('mark-reversed')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marquer tous les paiements d\'un opérateur comme reversés' })
  markReversed(
    @CurrentUser('sub') userId: string,
    @Body() dto: { operator: string; agencyId?: string },
  ) {
    return this.service.markReversed(userId, dto.operator, dto.agencyId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Annuler un paiement (remboursement si compte débité)' })
  cancel(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.cancel(id, userId);
  }
}
