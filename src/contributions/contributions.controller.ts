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
import { ContributionsService } from './contributions.service';
import {
  CreateSavingsProductDto,
  SubscribeSavingsDto,
  SavingsDepositDto,
  SavingsWithdrawalDto,
  OpenCashRegisterDto,
  CloseCashRegisterDto,
} from './dto/contribution.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Epargne, Caisse & Produits')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('savings')
export class ContributionsController {
  constructor(private contributionsService: ContributionsService) {}

  // ==================== PRODUITS D'EPARGNE ====================

  @Post('products')
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Creer un produit d\'epargne' })
  createProduct(@Body() dto: CreateSavingsProductDto) {
    return this.contributionsService.createProduct(dto);
  }

  @Get('products')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Lister les produits d\'epargne' })
  findAllProducts() {
    return this.contributionsService.findAllProducts();
  }

  @Get('products/:id')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Detail d\'un produit d\'epargne' })
  findOneProduct(@Param('id') id: string) {
    return this.contributionsService.findOneProduct(id);
  }

  @Patch('products/:id')
  @Permissions('CONTRIBUTIONS:UPDATE')
  @ApiOperation({ summary: 'Modifier un produit d\'epargne' })
  updateProduct(
    @Param('id') id: string,
    @Body() dto: Partial<CreateSavingsProductDto>,
  ) {
    return this.contributionsService.updateProduct(id, dto);
  }

  // ==================== COMPTES EPARGNE ====================

  @Post('accounts')
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Ouvrir un compte epargne pour un client' })
  subscribe(@Body() dto: SubscribeSavingsDto) {
    return this.contributionsService.subscribe(dto);
  }

  @Get('accounts')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Lister les comptes epargne' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'agencyId', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'status', required: false })
  findAllSavingsAccounts(
    @Query('clientId') clientId?: string,
    @Query('agencyId') agencyId?: string,
    @Query('productId') productId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contributionsService.findAllSavingsAccounts({
      clientId,
      agencyId,
      productId,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('accounts/:id')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Detail d\'un compte epargne avec historique' })
  findOneSavingsAccount(@Param('id') id: string) {
    return this.contributionsService.findOneSavingsAccount(id);
  }

  // ==================== DEPOT / RETRAIT ====================

  @Post('deposit')
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Depot sur un compte epargne (cotisation)' })
  deposit(@Body() dto: SavingsDepositDto) {
    return this.contributionsService.deposit(dto);
  }

  @Post('withdrawal')
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Retrait d\'un compte epargne' })
  withdrawal(@Body() dto: SavingsWithdrawalDto) {
    return this.contributionsService.withdrawal(dto);
  }

  // ==================== HISTORIQUE ====================

  @Get('accounts/:id/contributions')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Historique des mouvements d\'un compte epargne' })
  @ApiQuery({ name: 'type', required: false, description: 'DEPOSIT, WITHDRAWAL, INTEREST' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getContributions(
    @Param('id') id: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contributionsService.getContributions(id, {
      type,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  // ==================== CAISSE ====================

  @Post('cash-register/open')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Ouvrir une caisse' })
  openCashRegister(
    @Body() dto: OpenCashRegisterDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.contributionsService.openCashRegister(dto, userId);
  }

  @Post('cash-register/close')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Fermer une caisse' })
  closeCashRegister(
    @Body() dto: CloseCashRegisterDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.contributionsService.closeCashRegister(dto, userId);
  }

  @Get('cash-registers')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Lister les caisses' })
  @ApiQuery({ name: 'agencyId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'OPEN ou CLOSED' })
  getCashRegisters(
    @Query('agencyId') agencyId?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contributionsService.getCashRegisters({
      agencyId,
      userId,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }
}
