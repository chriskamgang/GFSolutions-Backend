import {
  Controller, Post, Get, Patch, Body, Param, Query,
  UseGuards, Request, Ip,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { PaymentGatewayService } from './payment-gateway.service';
import { MerchantApiKeyGuard } from './merchant-api-key.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

// ==================== ADMIN (JWT staff) ====================

@ApiTags('Payment Gateway — Admin')
@Controller('gateway/admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PaymentGatewayAdminController {
  constructor(private readonly svc: PaymentGatewayService) {}

  @Post('merchants')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Enregistrer un nouveau marchand' })
  registerMerchant(@Body() body: any, @Request() req: any) {
    return this.svc.registerMerchant(body, req.user?.userId);
  }

  @Get('merchants')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Lister les marchands' })
  listMerchants(@Query() query: any) {
    return this.svc.listMerchants(query);
  }

  @Get('merchants/:id')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Detail d\'un marchand' })
  getMerchant(@Param('id') id: string) {
    return this.svc.getMerchantById(id);
  }

  @Patch('merchants/:id/activate')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Activer un marchand' })
  activate(@Param('id') id: string) {
    return this.svc.updateMerchantStatus(id, 'ACTIVE');
  }

  @Patch('merchants/:id/suspend')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Suspendre un marchand' })
  suspend(@Param('id') id: string) {
    return this.svc.updateMerchantStatus(id, 'SUSPENDED');
  }

  @Patch('merchants/:id')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Modifier un marchand (commission, webhook, etc.)' })
  updateMerchant(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateMerchant(id, body);
  }

  @Patch('merchants/:id/regenerate-keys')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Regenerer les cles API d\'un marchand' })
  regenerateKeys(@Param('id') id: string) {
    return this.svc.regenerateApiKeys(id);
  }

  @Get('merchants/:id/payments')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Lister les paiements d\'un marchand (admin)' })
  getMerchantPayments(@Param('id') id: string, @Query() query: any) {
    return this.svc.listMerchantPayments(id, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques globales du payment gateway' })
  getStats() {
    return this.svc.getGatewayStats();
  }
}

// ==================== MARCHANDS (X-API-Key) ====================

@ApiTags('Payment Gateway — Marchands')
@Controller('gateway')
@ApiHeader({ name: 'X-API-Key', description: 'Cle API du marchand' })
@UseGuards(MerchantApiKeyGuard)
export class PaymentGatewayMerchantController {
  constructor(private readonly svc: PaymentGatewayService) {}

  @Post('payments')
  @ApiOperation({ summary: 'Creer un lien de paiement' })
  createPayment(@Body() body: any, @Request() req: any) {
    return this.svc.createPayment(req.merchant.id, body);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Lister les paiements du marchand' })
  listPayments(@Query() query: any, @Request() req: any) {
    return this.svc.listMerchantPayments(req.merchant.id, query);
  }

  @Get('payments/:paymentRef')
  @ApiOperation({ summary: 'Verifier le statut d\'un paiement' })
  getStatus(@Param('paymentRef') paymentRef: string, @Request() req: any) {
    return this.svc.getPaymentStatus(paymentRef, req.merchant.id);
  }
}

// ==================== PUBLIC (page de paiement) ====================

@ApiTags('Payment Gateway — Public')
@Controller('gateway/pay')
export class PaymentGatewayPublicController {
  constructor(private readonly svc: PaymentGatewayService) {}

  @Get(':paymentRef')
  @ApiOperation({ summary: 'Recuperer les details d\'un paiement (page checkout)' })
  getDetails(@Param('paymentRef') paymentRef: string) {
    return this.svc.getPaymentDetails(paymentRef);
  }

  @Post(':paymentRef/confirm')
  @ApiOperation({ summary: 'Confirmer le paiement (client saisit son N° + PIN)' })
  confirmPayment(
    @Param('paymentRef') paymentRef: string,
    @Body() body: { clientNumber: string; pin: string },
    @Ip() ip: string,
  ) {
    return this.svc.confirmPayment(paymentRef, body.clientNumber, body.pin, ip);
  }
}
