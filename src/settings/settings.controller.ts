import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContributionFrequency } from '@prisma/client';
import { SettingsService } from './settings.service';
import { SmsService } from '../sms/sms.service';
import { PawaPayService } from '../pawapay/pawapay.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('Parametres')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private smsService: SmsService,
    private kpayService: PawaPayService,
  ) {}

  // ==================== GET ALL SETTINGS ====================

  @Get()
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Recuperer tous les parametres regroupes par categorie' })
  getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  // ==================== FEE CONFIGS ====================

  @Get('fee-configs')
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Lister toutes les configurations de frais' })
  getAllFeeConfigs() {
    return this.settingsService.getAllFeeConfigs();
  }

  @Post('fee-configs')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Creer une configuration de frais' })
  createFeeConfig(
    @Body()
    body: {
      name: string;
      transactionType: string;
      channel?: string;
      feeType?: string;
      feeValue: number;
      minFee?: number;
      maxFee?: number;
      taxRate?: number;
      isActive?: boolean;
    },
  ) {
    return this.settingsService.createFeeConfig(body);
  }

  @Patch('fee-configs/:id')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Modifier une configuration de frais' })
  updateFeeConfig(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      feeType?: string;
      feeValue?: number;
      minFee?: number;
      maxFee?: number;
      taxRate?: number;
      isActive?: boolean;
    },
  ) {
    return this.settingsService.updateFeeConfig(id, body);
  }

  // ==================== CREDIT PRODUCTS ====================

  @Get('credit-products')
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Lister tous les produits de credit' })
  getAllCreditProducts() {
    return this.settingsService.getAllCreditProducts();
  }

  @Post('credit-products')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Creer un produit de credit' })
  createCreditProduct(
    @Body()
    body: {
      name: string;
      code: string;
      description?: string;
      minAmount: number;
      maxAmount: number;
      minDurationMonths: number;
      maxDurationMonths: number;
      interestRate: number;
      repaymentType?: string;
      applicationFeeType?: string;
      applicationFeeValue?: number;
      insuranceRate?: number;
      latePaymentRate?: number;
      gracePeriodMonths?: number;
      isActive?: boolean;
    },
  ) {
    return this.settingsService.createCreditProduct(body);
  }

  @Patch('credit-products/:id')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Modifier un produit de credit' })
  updateCreditProduct(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      minAmount?: number;
      maxAmount?: number;
      minDurationMonths?: number;
      maxDurationMonths?: number;
      interestRate?: number;
      repaymentType?: string;
      applicationFeeType?: string;
      applicationFeeValue?: number;
      insuranceRate?: number;
      latePaymentRate?: number;
      gracePeriodMonths?: number;
      isActive?: boolean;
    },
  ) {
    return this.settingsService.updateCreditProduct(id, body);
  }

  // ==================== SMS CONFIG ====================

  @Get('sms')
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Lire la configuration SMS NEXAH' })
  getSmsConfig() {
    return this.settingsService.getSmsConfig();
  }

  @Post('sms')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Sauvegarder la configuration SMS NEXAH' })
  async saveSmsConfig(
    @Body() body: { user: string; password?: string; senderId: string; enabled: boolean },
  ) {
    const result = await this.settingsService.saveSmsConfig(body);
    // Recharger la config dans le service SMS en memoire
    await this.smsService.loadConfigFromDb();
    return result;
  }

  @Post('sms/test')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Envoyer un SMS de test pour valider la configuration NEXAH' })
  async testSms(@Body() body: { phone: string }) {
    await this.smsService.loadConfigFromDb();
    const sent = await this.smsService.send(
      body.phone,
      'Test SMS GFS — Votre configuration NEXAH fonctionne correctement.',
    );
    return { success: sent, message: sent ? 'SMS de test envoye' : 'Echec envoi SMS' };
  }

  // ==================== SAVINGS PRODUCTS ====================

  @Get('savings-products')
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: "Lister tous les produits d'epargne" })
  getAllSavingsProducts() {
    return this.settingsService.getAllSavingsProducts();
  }

  @Patch('savings-products/:id')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: "Modifier un produit d'epargne" })
  updateSavingsProduct(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      interestRate?: number;
      minDeposit?: number;
      minBalance?: number;
      lockDurationMonths?: number;
      earlyWithdrawalPenalty?: number;
      contributionFrequency?: ContributionFrequency;
      contributionAmount?: number;
      isActive?: boolean;
    },
  ) {
    return this.settingsService.updateSavingsProduct(id, body);
  }

  // ==================== KPAY (Mobile Money) ====================

  @Get('kpay')
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Lire la configuration KPay Mobile Money' })
  getKpayConfig() {
    return this.settingsService.getKpayConfig();
  }

  @Post('kpay')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Sauvegarder la configuration KPay Mobile Money' })
  async saveKpayConfig(
    @Body() body: { apiKey: string; secretKey?: string; callbackUrl: string; enabled: boolean; enabledProviders?: string[] },
  ) {
    const result = await this.settingsService.saveKpayConfig(body);
    // Recharger la config KPay en memoire
    await this.kpayService.loadConfigFromDb();
    return result;
  }
}
