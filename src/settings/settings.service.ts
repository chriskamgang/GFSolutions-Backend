import { Injectable, NotFoundException } from '@nestjs/common';
import { ContributionFrequency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  // ==================== GET ALL SETTINGS ====================

  async getAllSettings() {
    const [settings, feeConfigs, creditProducts, savingsProducts, roles] =
      await Promise.all([
        this.prisma.setting.findMany({ orderBy: { category: 'asc' } }),
        this.prisma.feeConfig.findMany({
          where: { isActive: true },
          orderBy: { transactionType: 'asc' },
        }),
        this.prisma.creditProduct.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.savingsProduct.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.role.findMany({
          where: { maxTransactionAmount: { not: null } },
          select: {
            id: true,
            name: true,
            maxTransactionAmount: true,
            sessionTimeout: true,
          },
          orderBy: { name: 'asc' },
        }),
      ]);

    // Regrouper les settings par categorie
    const general: Record<string, string> = {};
    const penalties: Record<string, string> = {};
    const other: Record<string, string> = {};

    for (const s of settings) {
      const target =
        s.category === 'general'
          ? general
          : s.category === 'penalties'
            ? penalties
            : other;
      target[s.key] = s.value;
    }

    return {
      general,
      fees: feeConfigs,
      credit_products: creditProducts,
      savings_products: savingsProducts,
      limits: roles,
      penalties,
    };
  }

  // ==================== SETTINGS (cle-valeur) ====================

  async getSettingsByCategory(category: string) {
    return this.prisma.setting.findMany({ where: { category } });
  }

  async upsertSetting(key: string, value: string, category: string, description?: string) {
    return this.prisma.setting.upsert({
      where: { key },
      update: { value, category, description },
      create: { key, value, category, description },
    });
  }

  // ==================== FEE CONFIGS ====================

  async getAllFeeConfigs() {
    return this.prisma.feeConfig.findMany({ orderBy: { transactionType: 'asc' } });
  }

  async updateFeeConfig(
    id: string,
    data: {
      name?: string;
      feeType?: string;
      feeValue?: number;
      minFee?: number;
      maxFee?: number;
      taxRate?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.feeConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Configuration de frais non trouvee');
    }
    return this.prisma.feeConfig.update({ where: { id }, data });
  }

  async createFeeConfig(data: {
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
    return this.prisma.feeConfig.create({ data });
  }

  // ==================== CREDIT PRODUCTS ====================

  async getAllCreditProducts() {
    return this.prisma.creditProduct.findMany({ orderBy: { name: 'asc' } });
  }

  async updateCreditProduct(
    id: string,
    data: {
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
    const existing = await this.prisma.creditProduct.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Produit de credit non trouve');
    }
    return this.prisma.creditProduct.update({ where: { id }, data });
  }

  async createCreditProduct(data: {
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
  }) {
    return this.prisma.creditProduct.create({ data });
  }

  // ==================== SAVINGS PRODUCTS ====================

  async getAllSavingsProducts() {
    return this.prisma.savingsProduct.findMany({ orderBy: { name: 'asc' } });
  }

  // ==================== SMS CONFIG ====================

  async getSmsConfig() {
    const settings = await this.prisma.setting.findMany({ where: { category: 'sms' } });
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    return {
      user: map['nexah_sms_user'] || '',
      // Ne jamais renvoyer le mot de passe en clair
      passwordConfigured: !!map['nexah_sms_password'],
      senderId: map['nexah_sms_sender_id'] || 'GFS',
      enabled: map['nexah_sms_enabled'] !== 'false',
    };
  }

  async saveSmsConfig(data: { user: string; password?: string; senderId: string; enabled: boolean }) {
    const upserts = [
      this.prisma.setting.upsert({ where: { key: 'nexah_sms_user' }, update: { value: data.user }, create: { key: 'nexah_sms_user', value: data.user, category: 'sms', description: 'Identifiant NEXAH SMS' } }),
      this.prisma.setting.upsert({ where: { key: 'nexah_sms_sender_id' }, update: { value: data.senderId }, create: { key: 'nexah_sms_sender_id', value: data.senderId, category: 'sms', description: 'Expediteur SMS' } }),
      this.prisma.setting.upsert({ where: { key: 'nexah_sms_enabled' }, update: { value: data.enabled ? 'true' : 'false' }, create: { key: 'nexah_sms_enabled', value: data.enabled ? 'true' : 'false', category: 'sms', description: 'SMS actif' } }),
    ];
    if (data.password) {
      upserts.push(this.prisma.setting.upsert({ where: { key: 'nexah_sms_password' }, update: { value: data.password }, create: { key: 'nexah_sms_password', value: data.password, category: 'sms', description: 'Mot de passe NEXAH SMS' } }));
    }
    await Promise.all(upserts);
    return { success: true, message: 'Configuration SMS sauvegardee' };
  }

  async updateSavingsProduct(
    id: string,
    data: {
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
    const existing = await this.prisma.savingsProduct.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Produit d'epargne non trouve");
    }
    return this.prisma.savingsProduct.update({ where: { id }, data });
  }
}
