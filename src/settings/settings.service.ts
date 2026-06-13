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

  // ==================== KPAY (Mobile Money) ====================

  async getKpayConfig() {
    const settings = await this.prisma.setting.findMany({ where: { category: 'kpay' } });
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    let enabledProviders: string[] = [];
    try { enabledProviders = JSON.parse(map['kpay_enabled_providers'] || '[]'); } catch {}
    return {
      // Mode actif (live ou test)
      mode: map['kpay_mode'] || 'test',
      // Cles Test
      testApiKey: map['kpay_test_api_key'] || map['kpay_api_key'] || '',
      testSecretKeyConfigured: !!(map['kpay_test_secret_key'] || map['kpay_secret_key']),
      // Cles Live
      liveApiKey: map['kpay_live_api_key'] || '',
      liveSecretKeyConfigured: !!map['kpay_live_secret_key'],
      // Communs
      enabled: map['kpay_enabled'] !== 'false',
      enabledProviders,
    };
  }

  async saveKpayConfig(data: {
    mode?: string;
    testApiKey?: string;
    testSecretKey?: string;
    liveApiKey?: string;
    liveSecretKey?: string;
    enabled?: boolean;
    enabledProviders?: string[];
    // Retro-compatibilite
    apiKey?: string;
    secretKey?: string;
    callbackUrl?: string;
  }) {
    const upserts: any[] = [];

    const upsert = (key: string, value: string, desc: string) =>
      this.prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value, category: 'kpay', description: desc } });

    // Mode (live / test)
    if (data.mode) upserts.push(upsert('kpay_mode', data.mode, 'Mode KPay (live ou test)'));

    // Cles Test
    if (data.testApiKey) upserts.push(upsert('kpay_test_api_key', data.testApiKey, 'Cle API KPay Test'));
    if (data.testSecretKey) upserts.push(upsert('kpay_test_secret_key', data.testSecretKey, 'Cle Secrete KPay Test'));

    // Cles Live
    if (data.liveApiKey) upserts.push(upsert('kpay_live_api_key', data.liveApiKey, 'Cle API KPay Live'));
    if (data.liveSecretKey) upserts.push(upsert('kpay_live_secret_key', data.liveSecretKey, 'Cle Secrete KPay Live'));

    // Retro-compatibilite (ancien format -> test)
    if (data.apiKey && !data.testApiKey) upserts.push(upsert('kpay_test_api_key', data.apiKey, 'Cle API KPay Test'));
    if (data.secretKey && !data.testSecretKey) upserts.push(upsert('kpay_test_secret_key', data.secretKey, 'Cle Secrete KPay Test'));

    if (data.enabled !== undefined) upserts.push(upsert('kpay_enabled', data.enabled ? 'true' : 'false', 'KPay actif'));
    if (data.enabledProviders) upserts.push(upsert('kpay_enabled_providers', JSON.stringify(data.enabledProviders), 'Operateurs KPay actives'));

    if (upserts.length > 0) await Promise.all(upserts);
    return { success: true, message: 'Configuration KPay sauvegardee' };
  }

  // ==================== BACKUP / RESTAURATION ====================

  async listBackups() {
    const fs = await import('fs');
    const path = await import('path');
    const backupDir = '/var/www/backups';

    try {
      if (!fs.existsSync(backupDir)) {
        return { backups: [], directory: backupDir };
      }

      const files = fs.readdirSync(backupDir)
        .filter((f: string) => f.endsWith('.sql') || f.endsWith('.sql.gz'))
        .map((f: string) => {
          const stats = fs.statSync(path.join(backupDir, f));
          return {
            filename: f,
            size: stats.size,
            sizeHuman: stats.size > 1048576 ? `${(stats.size / 1048576).toFixed(1)} MB` : `${(stats.size / 1024).toFixed(1)} KB`,
            createdAt: stats.mtime,
          };
        })
        .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());

      return { backups: files, directory: backupDir };
    } catch {
      return { backups: [], directory: backupDir, error: 'Impossible de lire le repertoire de backup' };
    }
  }

  async createBackup() {
    const { execSync } = await import('child_process');
    const backupDir = '/var/www/backups';
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `microfinance_${date}.sql.gz`;
    const filepath = `${backupDir}/${filename}`;

    try {
      execSync(`mkdir -p ${backupDir}`);
      execSync(`mysqldump -u gfs -p'GFS@2026#Secure' microfinance_db | gzip > ${filepath}`, { timeout: 120000 });
      const fs = await import('fs');
      const stats = fs.statSync(filepath);
      return { success: true, filename, size: stats.size, path: filepath };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async restoreBackup(filename: string) {
    const { execSync } = await import('child_process');
    const backupDir = '/var/www/backups';
    const filepath = `${backupDir}/${filename}`;

    const fs = await import('fs');
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException(`Fichier de backup non trouve: ${filename}`);
    }

    try {
      if (filename.endsWith('.gz')) {
        execSync(`gunzip -c ${filepath} | mysql -u gfs -p'GFS@2026#Secure' microfinance_db`, { timeout: 300000 });
      } else {
        execSync(`mysql -u gfs -p'GFS@2026#Secure' microfinance_db < ${filepath}`, { timeout: 300000 });
      }
      return { success: true, message: `Restauration de ${filename} terminee` };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
