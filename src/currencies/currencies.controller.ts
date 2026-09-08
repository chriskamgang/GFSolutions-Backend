import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrenciesService } from './currencies.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
  CreateExchangeRateDto,
  ConvertCurrencyDto,
  CreateSubAccountDto,
} from './dto/currency.dto';

@ApiTags('Devises & Multi-Devises')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  // ==================== DEVISES ====================

  @Post()
  @ApiOperation({ summary: 'Creer une devise' })
  @Permissions('SETTINGS:WRITE')
  createCurrency(@Body() dto: CreateCurrencyDto, @Request() req: any) {
    return this.currenciesService.createCurrency(dto, req.user?.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister toutes les devises' })
  @Permissions('SETTINGS:READ')
  findAllCurrencies() {
    return this.currenciesService.findAllCurrencies();
  }

  @Get('seed')
  @ApiOperation({ summary: 'Initialiser les devises par defaut (XAF, EUR, USD, GBP, NGN)' })
  @Permissions('SETTINGS:WRITE')
  seedDefaultCurrencies() {
    return this.currenciesService.seedDefaultCurrencies();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d\'une devise' })
  @Permissions('SETTINGS:READ')
  findOneCurrency(@Param('id') id: string) {
    return this.currenciesService.findOneCurrency(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une devise' })
  @Permissions('SETTINGS:WRITE')
  updateCurrency(@Param('id') id: string, @Body() dto: UpdateCurrencyDto) {
    return this.currenciesService.updateCurrency(id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Activer/desactiver une devise' })
  @Permissions('SETTINGS:WRITE')
  toggleCurrency(@Param('id') id: string) {
    return this.currenciesService.toggleCurrency(id);
  }

  // ==================== TAUX DE CHANGE ====================

  @Post('rates')
  @ApiOperation({ summary: 'Creer un taux de change' })
  @Permissions('SETTINGS:WRITE')
  createExchangeRate(@Body() dto: CreateExchangeRateDto, @Request() req: any) {
    return this.currenciesService.createExchangeRate(dto, req.user?.id);
  }

  @Get('rates/active')
  @ApiOperation({ summary: 'Lister les taux de change actifs' })
  @Permissions('SETTINGS:READ')
  getActiveRates() {
    return this.currenciesService.getActiveRates();
  }

  @Get('rates/history')
  @ApiOperation({ summary: 'Historique des taux pour une paire de devises' })
  @ApiQuery({ name: 'from', required: true, example: 'XAF' })
  @ApiQuery({ name: 'to', required: true, example: 'EUR' })
  @ApiQuery({ name: 'limit', required: false, example: '10' })
  @Permissions('SETTINGS:READ')
  getRateHistory(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit?: string,
  ) {
    return this.currenciesService.getRateHistory(from, to, limit ? +limit : 10);
  }

  @Get('rates/current')
  @ApiOperation({ summary: 'Taux actuel pour une paire de devises' })
  @ApiQuery({ name: 'from', required: true, example: 'XAF' })
  @ApiQuery({ name: 'to', required: true, example: 'EUR' })
  @Permissions('SETTINGS:READ')
  getCurrentRate(@Query('from') from: string, @Query('to') to: string) {
    return this.currenciesService.getCurrentRate(from, to);
  }

  // ==================== SOUS-COMPTES ====================

  @Post('sub-accounts')
  @ApiOperation({ summary: 'Creer un sous-compte devise' })
  @Permissions('ACCOUNTS:WRITE')
  createSubAccount(@Body() dto: CreateSubAccountDto) {
    return this.currenciesService.createSubAccount(dto);
  }

  @Get('sub-accounts/:accountId')
  @ApiOperation({ summary: 'Lister les sous-comptes devise d\'un compte' })
  @Permissions('ACCOUNTS:READ')
  getSubAccounts(@Param('accountId') accountId: string) {
    return this.currenciesService.getSubAccounts(accountId);
  }

  @Get('sub-accounts/:accountId/:currencyCode/balance')
  @ApiOperation({ summary: 'Solde d\'un sous-compte devise' })
  @Permissions('ACCOUNTS:READ')
  getSubAccountBalance(
    @Param('accountId') accountId: string,
    @Param('currencyCode') currencyCode: string,
  ) {
    return this.currenciesService.getSubAccountBalance(accountId);
  }

  // ==================== CONVERSION ====================

  @Post('convert')
  @ApiOperation({ summary: 'Convertir un montant entre devises' })
  @Permissions('TRANSACTIONS:WRITE')
  convertCurrency(@Body() dto: ConvertCurrencyDto, @Request() req: any) {
    return this.currenciesService.convertCurrency(dto, req.user?.id);
  }

  @Post('simulate')
  @ApiOperation({ summary: 'Simuler une conversion (sans execution)' })
  @Permissions('TRANSACTIONS:READ')
  simulateConversion(@Body() dto: ConvertCurrencyDto) {
    return this.currenciesService.simulateConversion(dto.fromCurrency, dto.toCurrency, dto.amount);
  }
}
