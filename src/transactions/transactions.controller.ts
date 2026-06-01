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
import { TransactionsService } from './transactions.service';
import { DepositDto, WithdrawalDto, TransferDto, ExternalTransferDto, ApproveExternalTransferDto } from './dto/transaction.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Post('deposit')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Effectuer un depot via Mobile Money' })
  deposit(@Body() dto: DepositDto, @CurrentUser() user: any) {
    return this.transactionsService.deposit(dto, user.sub);
  }

  @Post('withdrawal')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Effectuer un retrait vers Mobile Money' })
  withdrawal(@Body() dto: WithdrawalDto, @CurrentUser() user: any) {
    return this.transactionsService.withdrawal(dto, user.sub);
  }

  @Post('transfer')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Transfert entre comptes' })
  transfer(@Body() dto: TransferDto, @CurrentUser() user: any) {
    return this.transactionsService.transfer(dto, user.sub);
  }

  @Get('signataires/:accountId')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Obtenir les signataires autorises d\'un compte (Personne Morale)' })
  getSignataires(@Param('accountId') accountId: string) {
    return this.transactionsService.getSignataires(accountId);
  }

  @Post('external-transfer')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Creer un virement externe (soumis a validation Maker-Checker)' })
  createExternalTransfer(@Body() dto: ExternalTransferDto, @CurrentUser() user: any) {
    return this.transactionsService.createExternalTransfer(dto, user.sub);
  }

  @Post('external-transfer/:id/approve')
  @Permissions('TRANSACTIONS:UPDATE')
  @ApiOperation({ summary: 'Approuver ou rejeter un virement externe' })
  approveExternalTransfer(
    @Param('id') id: string,
    @Body() dto: ApproveExternalTransferDto,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.approveExternalTransfer(id, dto, user.sub);
  }

  @Get('external-transfers/pending')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Lister les virements externes en attente de validation' })
  @ApiQuery({ name: 'agencyId', required: false })
  getPendingExternalTransfers(@Query('agencyId') agencyId?: string) {
    return this.transactionsService.getPendingExternalTransfers(agencyId);
  }

  @Get()
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Lister les transactions' })
  @ApiQuery({ name: 'agencyId', required: false })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  findAll(
    @Query('agencyId') agencyId?: string,
    @Query('accountId') accountId?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.transactionsService.findAll({
      agencyId,
      accountId,
      type,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  // ==================== FEE CONFIG CRUD ====================

  @Post('fee-configs')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Creer une configuration de frais/commissions' })
  createFeeConfig(@Body() body: {
    name: string;
    transactionType: string;
    channel?: string;
    feeType?: string;
    feeValue: number;
    minFee?: number;
    maxFee?: number;
    taxRate?: number;
    isActive?: boolean;
  }) {
    return this.transactionsService.createFeeConfig(body);
  }

  @Get('fee-configs')
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Lister toutes les configurations de frais' })
  findAllFeeConfigs() {
    return this.transactionsService.findAllFeeConfigs();
  }

  @Patch('fee-configs/:id')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Modifier une configuration de frais' })
  updateFeeConfig(
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      transactionType?: string;
      channel?: string;
      feeType?: string;
      feeValue?: number;
      minFee?: number;
      maxFee?: number;
      taxRate?: number;
      isActive?: boolean;
    },
  ) {
    return this.transactionsService.updateFeeConfig(id, body);
  }

  // ==================== RECEIPT ====================

  @Get(':id/receipt')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Generer les donnees du recu de transaction' })
  getReceipt(@Param('id') id: string) {
    return this.transactionsService.generateReceipt(id);
  }

  @Get(':id')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Detail d\'une transaction' })
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }
}
