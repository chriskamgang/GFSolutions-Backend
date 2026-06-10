import {
  Controller, Post, Get, Body, Param,
  UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PawaPayService } from './pawapay.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('KPay Mobile Money')
@Controller('pawapay')
export class PawaPayController {
  constructor(private readonly kpayService: PawaPayService) {}

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
      provider: string;
      agencyId: string;
      description?: string;
    },
    @Request() req: any,
  ) {
    return this.kpayService.initiateDeposit({ ...body, initiatedBy: req.user?.userId });
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
      provider: string;
      agencyId: string;
      description?: string;
    },
    @Request() req: any,
  ) {
    return this.kpayService.initiateDeposit({ ...body, initiatedBy: req.user?.sub });
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
      provider: string;
      agencyId: string;
      description?: string;
    },
  ) {
    return this.kpayService.initiatePayout(body);
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
      provider: string;
      agencyId: string;
      description?: string;
    },
  ) {
    return this.kpayService.initiatePayout(body);
  }

  // ==================== WEBHOOK KPAY ====================

  @Post('webhook')
  @ApiOperation({ summary: 'Webhook KPay (paiement et retrait)' })
  handleWebhook(@Body() payload: any) {
    return this.kpayService.handleWebhook(payload);
  }

  // Ancien format callbacks (redirige vers webhook unifie)
  @Post('callback/deposit')
  @ApiOperation({ summary: 'Callback depot (compatibilite)' })
  depositCallback(@Body() payload: any) {
    return this.kpayService.handleWebhook(payload);
  }

  @Post('callback/payout')
  @ApiOperation({ summary: 'Callback retrait (compatibilite)' })
  payoutCallback(@Body() payload: any) {
    return this.kpayService.handleWebhook(payload);
  }

  // ==================== SOLDE & RECHARGE MARCHAND ====================

  @Get('balance')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Consulter le solde marchand KPay' })
  getMerchantBalance() {
    return this.kpayService.getMerchantBalance();
  }

  @Post('topup')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Recharger le solde marchand KPay via Mobile Money' })
  topUpBalance(
    @Body() body: { amount: number; phone: string; provider: string },
  ) {
    return this.kpayService.topUpMerchantBalance(body);
  }

  @Get('topup/status/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Verifier le statut d\'une recharge marchand' })
  getTopUpStatus(@Param('id') id: string) {
    return this.kpayService.getTopUpStatus(id);
  }

  // ==================== STATUT & DISPONIBILITE ====================

  @Get('status/deposit/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Verifier le statut d\'un depot KPay' })
  getDepositStatus(@Param('id') id: string) {
    return this.kpayService.getDepositStatus(id);
  }

  @Get('status/payout/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Verifier le statut d\'un retrait KPay' })
  getPayoutStatus(@Param('id') id: string) {
    return this.kpayService.getPayoutStatus(id);
  }

  @Get('availability')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Verifier la disponibilite des operateurs KPay' })
  getAvailability() {
    return this.kpayService.getAvailability();
  }
}
