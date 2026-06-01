import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('Comptes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @Get()
  @Permissions('ACCOUNTS:READ')
  @ApiOperation({ summary: 'Lister tous les comptes' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountsService.findAll({
      type,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('products')
  @Permissions('ACCOUNTS:READ')
  @ApiOperation({ summary: 'Lister les produits de compte disponibles' })
  getProducts(@Query('all') all?: string) {
    return this.accountsService.getProducts(all === 'true');
  }

  @Post('products')
  @Permissions('SETTINGS:CREATE')
  @ApiOperation({ summary: 'Creer un produit de compte (Admin)' })
  createProduct(@Body() body: any) {
    return this.accountsService.createProduct(body);
  }

  @Patch('products/:id')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Modifier un produit de compte (Admin)' })
  updateProduct(@Param('id') id: string, @Body() body: any) {
    return this.accountsService.updateProduct(id, body);
  }

  @Delete('products/:id')
  @Permissions('SETTINGS:DELETE')
  @ApiOperation({ summary: 'Desactiver un produit de compte (Admin)' })
  deleteProduct(@Param('id') id: string) {
    return this.accountsService.toggleProduct(id);
  }

  @Get('client/:clientId')
  @Permissions('ACCOUNTS:READ')
  @ApiOperation({ summary: 'Comptes d\'un client' })
  findByClient(@Param('clientId') clientId: string) {
    return this.accountsService.findByClient(clientId);
  }

  @Get(':id')
  @Permissions('ACCOUNTS:READ')
  @ApiOperation({ summary: 'Detail d\'un compte' })
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Get(':id/balance')
  @Permissions('ACCOUNTS:READ')
  @ApiOperation({ summary: 'Solde d\'un compte' })
  getBalance(@Param('id') id: string) {
    return this.accountsService.getBalance(id);
  }

  @Post()
  @Permissions('ACCOUNTS:CREATE')
  @ApiOperation({ summary: 'Ouvrir un compte pour un client (avec produit)' })
  createAccount(
    @Body() body: {
      clientId: string;
      agencyId: string;
      productId: string;
      managerId?: string;
      initialDeposit?: number;
      maturityDate?: string;
    },
  ) {
    return this.accountsService.createAccount(body);
  }

  @Post('savings')
  @Permissions('ACCOUNTS:CREATE')
  @ApiOperation({ summary: 'Creer un compte epargne' })
  createSavings(
    @Body() body: { clientId: string; agencyId: string; interestRate: number },
  ) {
    return this.accountsService.createSavingsAccount(
      body.clientId,
      body.agencyId,
      body.interestRate,
    );
  }
}
