import {
  Controller, Post, Get, Body, Param,
  UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PawaPayService, PawaPayProvider } from './pawapay.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('PawaPay Mobile Money')
@Controller('pawapay')
export class PawaPayController {
  constructor(private readonly pawaPayService: PawaPayService) {}

  // ==================== DEPOT ====================

  @Post('deposit')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Initier un depot Mobile Money (MTN MoMo / Orange Money)' })
  initiateDeposit(
    @Body() body: {
      accountId: string;
      amount: number;
      phone: string;
      provider: PawaPayProvider;
      agencyId: string;
      description?: string;
    },
    @Request() req: any,
  ) {
    return this.pawaPayService.initiateDeposit({ ...body, initiatedBy: req.user?.userId });
  }

  // Depot depuis l'app mobile client (JWT client)
  @Post('client/deposit')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiOperation({ summary: 'Initier un depot depuis l\'app mobile client' })
  clientDeposit(
    @Body() body: {
      accountId: string;
      amount: number;
      phone: string;
      provider: PawaPayProvider;
      agencyId: string;
      description?: string;
    },
    @Request() req: any,
  ) {
    return this.pawaPayService.initiateDeposit({ ...body, initiatedBy: req.user?.sub });
  }

  // ==================== RETRAIT ====================

  @Post('payout')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Initier un retrait Mobile Money' })
  initiatePayout(
    @Body() body: {
      accountId: string;
      amount: number;
      phone: string;
      provider: PawaPayProvider;
      agencyId: string;
      description?: string;
    },
  ) {
    return this.pawaPayService.initiatePayout(body);
  }

  // Retrait depuis l'app mobile client
  @Post('client/payout')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiOperation({ summary: 'Initier un retrait depuis l\'app mobile client' })
  clientPayout(
    @Body() body: {
      accountId: string;
      amount: number;
      phone: string;
      provider: PawaPayProvider;
      agencyId: string;
      description?: string;
    },
  ) {
    return this.pawaPayService.initiatePayout(body);
  }

  // ==================== CALLBACKS (pawaPay → notre serveur) ====================

  @Post('callback/deposit')
  @ApiOperation({ summary: 'Callback pawaPay pour les depots (webhook)' })
  depositCallback(@Body() payload: any) {
    return this.pawaPayService.handleDepositCallback(payload);
  }

  @Post('callback/payout')
  @ApiOperation({ summary: 'Callback pawaPay pour les retraits (webhook)' })
  payoutCallback(@Body() payload: any) {
    return this.pawaPayService.handlePayoutCallback(payload);
  }

  // ==================== STATUT & DISPONIBILITE ====================

  @Get('status/deposit/:depositId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Verifier le statut d\'un depot pawaPay' })
  getDepositStatus(@Param('depositId') depositId: string) {
    return this.pawaPayService.getDepositStatus(depositId);
  }

  @Get('status/payout/:payoutId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Verifier le statut d\'un payout pawaPay' })
  getPayoutStatus(@Param('payoutId') payoutId: string) {
    return this.pawaPayService.getPayoutStatus(payoutId);
  }

  @Get('availability')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Verifier la disponibilite des operateurs pawaPay' })
  getAvailability() {
    return this.pawaPayService.getAvailability();
  }
}
