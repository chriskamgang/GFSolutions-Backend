import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CreditsService } from './credits.service';
import { SimulateCreditDto } from './dto/simulate-credit.dto';
import { CreateCreditDto } from './dto/create-credit.dto';
import { ValidateCreditDto } from './dto/validate-credit.dto';
import { CreateCreditProductDto, UpdateCreditProductDto, EarlyRepaymentDto } from './dto/credit-product.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Credits')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('credits')
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Post('simulate')
  @ApiOperation({ summary: 'Simuler un credit avec tableau d\'amortissement' })
  @Permissions('CREDITS:READ')
  simulate(@Body() dto: SimulateCreditDto) {
    return this.creditsService.simulate(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Creer une demande de credit' })
  @Permissions('CREDITS:CREATE')
  create(@Body() dto: CreateCreditDto, @CurrentUser() user: any) {
    return this.creditsService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les credits' })
  @Permissions('CREDITS:READ')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'clientId', required: false })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.creditsService.findAll({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      status,
      clientId,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques des credits' })
  @Permissions('CREDITS:READ')
  getStats() {
    return this.creditsService.getStats();
  }

  // ==================== PRODUITS DE CREDIT ====================

  @Post('products')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Creer un produit de credit' })
  createProduct(@Body() dto: CreateCreditProductDto) {
    return this.creditsService.createProduct(dto);
  }

  @Get('products')
  @Permissions('CREDITS:READ')
  @ApiOperation({ summary: 'Liste des produits de credit' })
  findAllProducts() {
    return this.creditsService.findAllProducts();
  }

  @Get('products/:id')
  @Permissions('CREDITS:READ')
  @ApiOperation({ summary: 'Detail d\'un produit de credit' })
  findOneProduct(@Param('id') id: string) {
    return this.creditsService.findOneProduct(id);
  }

  @Patch('products/:id')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Modifier un produit de credit' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateCreditProductDto) {
    return this.creditsService.updateProduct(id, dto);
  }

  // ==================== RECOUVREMENT ====================

  @Get('recovery/dashboard')
  @Permissions('CREDITS:READ')
  @ApiOperation({ summary: 'Tableau de bord recouvrement (retards classes par risque)' })
  getRecoveryDashboard() {
    return this.creditsService.getRecoveryDashboard();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d\'un credit' })
  @Permissions('CREDITS:READ')
  findOne(@Param('id') id: string) {
    return this.creditsService.findOne(id);
  }

  @Patch(':id/validate')
  @ApiOperation({ summary: 'Valider ou rejeter un credit (workflow multi-niveau)' })
  @Permissions('CREDITS:UPDATE')
  validate(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: ValidateCreditDto,
  ) {
    return this.creditsService.validate(id, user.sub, dto);
  }

  @Patch(':id/disburse')
  @ApiOperation({ summary: 'Decaisser un credit approuve' })
  @Permissions('CREDITS:UPDATE')
  disburse(@Param('id') id: string, @CurrentUser() user: any) {
    return this.creditsService.disburse(id, user.sub);
  }

  @Patch('repayments/:repaymentId/pay')
  @ApiOperation({ summary: 'Enregistrer un remboursement' })
  @Permissions('CREDITS:UPDATE')
  recordRepayment(
    @Param('repaymentId') repaymentId: string,
    @Body('amount') amount: number,
    @CurrentUser() user: any,
  ) {
    return this.creditsService.recordRepayment(repaymentId, amount, user.sub);
  }

  @Get(':id/scoring')
  @ApiOperation({ summary: 'Scoring credit (7 categories, score 0-100)' })
  @Permissions('CREDITS:READ')
  scoreCredit(@Param('id') id: string) {
    return this.creditsService.scoreCredit(id);
  }

  @Get(':id/contract')
  @ApiOperation({ summary: 'Donnees pour generer le contrat PDF du credit' })
  @Permissions('CREDITS:READ')
  getContract(@Param('id') id: string) {
    return this.creditsService.generateContract(id);
  }

  @Post(':id/restructure')
  @ApiOperation({ summary: 'Restructurer un credit defaillant' })
  @Permissions('CREDITS:UPDATE')
  restructureCredit(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { newAmount: number; newInterestRate: number; newDurationMonths: number; reason: string },
  ) {
    return this.creditsService.restructureCredit(id, body, user.sub);
  }

  @Post(':id/early-repayment')
  @Permissions('CREDITS:UPDATE')
  @ApiOperation({ summary: 'Remboursement anticipe (total ou partiel)' })
  earlyRepayment(
    @Param('id') id: string,
    @Body() dto: EarlyRepaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.creditsService.earlyRepayment(id, dto.amount, dto.isTotal, user.sub);
  }

  @Post(':id/write-off')
  @Permissions('CREDITS:UPDATE')
  @ApiOperation({ summary: 'Radier un credit irrecouvrable (write-off)' })
  writeOff(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: any,
  ) {
    return this.creditsService.writeOff(id, body.reason, user.sub);
  }
}
