import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
  CreateExchangeRateDto,
  ConvertCurrencyDto,
  CreateSubAccountDto,
} from './dto/currency.dto';

@Injectable()
export class CurrenciesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==================== DEVISES ====================

  async createCurrency(dto: CreateCurrencyDto, userId?: string) {
    const existing = await this.prisma.currency.findUnique({ where: { code: dto.code.toUpperCase() } });
    if (existing) throw new ConflictException(`La devise ${dto.code} existe deja`);

    const currency = await this.prisma.currency.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        symbol: dto.symbol,
        decimals: dto.decimals ?? (dto.code.toUpperCase() === 'XAF' ? 0 : 2),
      },
    });

    if (userId) {
      this.auditService.log({
        userId, action: 'CREATE', module: 'CURRENCIES',
        entityId: currency.id, entityType: 'Currency',
        details: `Creation devise ${currency.code} (${currency.name})`,
      }).catch(() => {});
    }

    return currency;
  }

  async findAllCurrencies(includeInactive = false) {
    return this.prisma.currency.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: { select: { subAccounts: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
  }

  async findOneCurrency(id: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { id },
      include: { _count: { select: { subAccounts: true } } },
    });
    if (!currency) throw new NotFoundException('Devise non trouvee');
    return currency;
  }

  async findCurrencyByCode(code: string) {
    const currency = await this.prisma.currency.findUnique({ where: { code: code.toUpperCase() } });
    if (!currency) throw new NotFoundException(`Devise ${code} non trouvee`);
    return currency;
  }

  async updateCurrency(id: string, dto: UpdateCurrencyDto, userId?: string) {
    await this.findOneCurrency(id);
    const result = await this.prisma.currency.update({ where: { id }, data: dto });

    if (userId) {
      this.auditService.log({
        userId, action: 'UPDATE', module: 'CURRENCIES',
        entityId: id, entityType: 'Currency',
        details: `Modification devise ${result.code}`,
      }).catch(() => {});
    }

    return result;
  }

  async toggleCurrency(id: string) {
    const currency = await this.findOneCurrency(id);
    if (currency.isDefault) {
      throw new BadRequestException('Impossible de desactiver la devise par defaut');
    }
    return this.prisma.currency.update({
      where: { id },
      data: { isActive: !currency.isActive },
    });
  }

  async seedDefaultCurrencies() {
    const defaults = [
      { code: 'XAF', name: 'Franc CFA (CEMAC)', symbol: 'FCFA', decimals: 0, isDefault: true },
      { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, isDefault: false },
      { code: 'USD', name: 'Dollar americain', symbol: '$', decimals: 2, isDefault: false },
      { code: 'GBP', name: 'Livre sterling', symbol: '£', decimals: 2, isDefault: false },
      { code: 'NGN', name: 'Naira nigerien', symbol: '₦', decimals: 2, isDefault: false },
    ];

    const results: any[] = [];
    for (const currency of defaults) {
      const result = await this.prisma.currency.upsert({
        where: { code: currency.code },
        update: {},
        create: currency,
      });
      results.push(result);
    }

    // Taux de change par defaut (parite fixe EUR/XAF + estimations)
    const defaultRates = [
      { from: 'EUR', to: 'XAF', rate: 655.957, buy: 653, sell: 658 },
      { from: 'USD', to: 'XAF', rate: 600, buy: 595, sell: 605 },
      { from: 'GBP', to: 'XAF', rate: 760, buy: 755, sell: 765 },
      { from: 'NGN', to: 'XAF', rate: 0.38, buy: 0.36, sell: 0.40 },
    ];

    for (const r of defaultRates) {
      const fromCurrency = results.find(c => c.code === r.from);
      const toCurrency = results.find(c => c.code === r.to);
      if (fromCurrency && toCurrency) {
        await this.prisma.exchangeRate.upsert({
          where: {
            fromCurrencyId_toCurrencyId_validFrom: {
              fromCurrencyId: fromCurrency.id,
              toCurrencyId: toCurrency.id,
              validFrom: new Date(new Date().toISOString().slice(0, 10)),
            },
          },
          update: { rate: r.rate, buyRate: r.buy, sellRate: r.sell },
          create: {
            fromCurrencyId: fromCurrency.id,
            toCurrencyId: toCurrency.id,
            rate: r.rate,
            buyRate: r.buy,
            sellRate: r.sell,
            validFrom: new Date(new Date().toISOString().slice(0, 10)),
          },
        });
      }
    }

    return { currencies: results.length, message: 'Devises et taux par defaut initialises' };
  }

  // ==================== TAUX DE CHANGE ====================

  async createExchangeRate(dto: CreateExchangeRateDto, userId?: string) {
    const fromCurrency = await this.findCurrencyByCode(dto.fromCurrency);
    const toCurrency = await this.findCurrencyByCode(dto.toCurrency);

    if (fromCurrency.id === toCurrency.id) {
      throw new BadRequestException('Les devises source et cible doivent etre differentes');
    }

    // Desactiver les anciens taux pour cette paire
    await this.prisma.exchangeRate.updateMany({
      where: {
        fromCurrencyId: fromCurrency.id,
        toCurrencyId: toCurrency.id,
        isActive: true,
      },
      data: { isActive: false, validUntil: new Date() },
    });

    const rate = await this.prisma.exchangeRate.create({
      data: {
        fromCurrencyId: fromCurrency.id,
        toCurrencyId: toCurrency.id,
        rate: dto.rate,
        buyRate: dto.buyRate,
        sellRate: dto.sellRate,
        feePercentage: dto.feePercentage ?? 1.5,
        createdById: userId,
      },
      include: { fromCurrency: true, toCurrency: true },
    });

    if (userId) {
      this.auditService.log({
        userId, action: 'CREATE', module: 'CURRENCIES',
        entityId: rate.id, entityType: 'ExchangeRate',
        details: `Nouveau taux ${dto.fromCurrency}/${dto.toCurrency} = ${dto.rate}`,
      }).catch(() => {});
    }

    return rate;
  }

  async getActiveRates() {
    return this.prisma.exchangeRate.findMany({
      where: { isActive: true },
      include: { fromCurrency: true, toCurrency: true },
      orderBy: { validFrom: 'desc' },
    });
  }

  async getRateHistory(fromCode: string, toCode: string, limit = 30) {
    const fromCurrency = await this.findCurrencyByCode(fromCode);
    const toCurrency = await this.findCurrencyByCode(toCode);

    return this.prisma.exchangeRate.findMany({
      where: {
        fromCurrencyId: fromCurrency.id,
        toCurrencyId: toCurrency.id,
      },
      orderBy: { validFrom: 'desc' },
      take: limit,
    });
  }

  async getCurrentRate(fromCode: string, toCode: string) {
    const fromCurrency = await this.findCurrencyByCode(fromCode);
    const toCurrency = await this.findCurrencyByCode(toCode);

    // Chercher taux direct
    let rate = await this.prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: fromCurrency.id,
        toCurrencyId: toCurrency.id,
        isActive: true,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (rate) {
      return {
        fromCurrency: fromCode,
        toCurrency: toCode,
        rate: Number(rate.rate),
        buyRate: rate.buyRate ? Number(rate.buyRate) : null,
        sellRate: rate.sellRate ? Number(rate.sellRate) : null,
        feePercentage: Number(rate.feePercentage),
        validFrom: rate.validFrom,
        direction: 'DIRECT' as const,
      };
    }

    // Chercher taux inverse
    const inverseRate = await this.prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: toCurrency.id,
        toCurrencyId: fromCurrency.id,
        isActive: true,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (inverseRate) {
      const invRate = 1 / Number(inverseRate.rate);
      return {
        fromCurrency: fromCode,
        toCurrency: toCode,
        rate: invRate,
        buyRate: inverseRate.sellRate ? 1 / Number(inverseRate.sellRate) : null,
        sellRate: inverseRate.buyRate ? 1 / Number(inverseRate.buyRate) : null,
        feePercentage: Number(inverseRate.feePercentage),
        validFrom: inverseRate.validFrom,
        direction: 'INVERSE' as const,
      };
    }

    throw new NotFoundException(`Aucun taux de change trouve pour ${fromCode}/${toCode}`);
  }

  // ==================== SOUS-COMPTES DEVISES ====================

  async createSubAccount(dto: CreateSubAccountDto, userId?: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException('Compte principal non trouve');

    const currency = await this.findCurrencyByCode(dto.currencyCode);

    // Verifier qu'un sous-compte n'existe pas deja
    const existing = await this.prisma.currencySubAccount.findUnique({
      where: { accountId_currencyId: { accountId: dto.accountId, currencyId: currency.id } },
    });
    if (existing) {
      throw new ConflictException(`Un sous-compte ${dto.currencyCode} existe deja pour ce compte`);
    }

    // Ne pas creer de sous-compte dans la devise par defaut du compte
    if (currency.code === (account.currency || 'XAF')) {
      throw new BadRequestException(
        `Le compte principal est deja en ${currency.code}. Creez un sous-compte dans une autre devise.`,
      );
    }

    const subAccount = await this.prisma.currencySubAccount.create({
      data: {
        accountId: dto.accountId,
        currencyId: currency.id,
      },
      include: { currency: true, account: { select: { accountNumber: true } } },
    });

    if (userId) {
      this.auditService.log({
        userId, action: 'CREATE', module: 'CURRENCIES',
        entityId: subAccount.id, entityType: 'CurrencySubAccount',
        details: `Sous-compte ${currency.code} cree pour compte ${account.accountNumber}`,
      }).catch(() => {});
    }

    return subAccount;
  }

  async getSubAccounts(accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Compte non trouve');

    const subAccounts = await this.prisma.currencySubAccount.findMany({
      where: { accountId, isActive: true },
      include: { currency: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      accountId,
      accountNumber: account.accountNumber,
      mainCurrency: account.currency || 'XAF',
      mainBalance: Number(account.balance),
      subAccounts: subAccounts.map(sa => ({
        id: sa.id,
        currency: sa.currency.code,
        currencyName: sa.currency.name,
        symbol: sa.currency.symbol,
        balance: Number(sa.balance),
        decimals: sa.currency.decimals,
      })),
    };
  }

  async getSubAccountBalance(subAccountId: string) {
    const sub = await this.prisma.currencySubAccount.findUnique({
      where: { id: subAccountId },
      include: { currency: true, account: { select: { accountNumber: true } } },
    });
    if (!sub) throw new NotFoundException('Sous-compte non trouve');

    return {
      id: sub.id,
      accountNumber: sub.account.accountNumber,
      currency: sub.currency.code,
      symbol: sub.currency.symbol,
      balance: Number(sub.balance),
    };
  }

  // ==================== CONVERSION ====================

  async convertCurrency(dto: ConvertCurrencyDto, userId?: string) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Le montant doit etre positif');
    }

    if (dto.fromCurrency.toUpperCase() === dto.toCurrency.toUpperCase()) {
      throw new BadRequestException('Les devises source et cible doivent etre differentes');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
      include: { client: true },
    });
    if (!account) throw new NotFoundException('Compte non trouve');

    const rateInfo = await this.getCurrentRate(dto.fromCurrency, dto.toCurrency);
    const effectiveRate = rateInfo.sellRate || rateInfo.rate;
    const feePercentage = rateInfo.feePercentage;

    // Calculer les frais et le montant converti
    const fees = Math.round(dto.amount * feePercentage / 100);
    const netAmount = dto.amount - fees;
    const fromCurrency = await this.findCurrencyByCode(dto.fromCurrency);
    const toCurrency = await this.findCurrencyByCode(dto.toCurrency);
    const convertedAmount = this.roundForCurrency(netAmount * effectiveRate, toCurrency.decimals);

    // Determiner la source (compte principal ou sous-compte)
    const mainCurrency = (account.currency || 'XAF').toUpperCase();
    const fromIsMain = dto.fromCurrency.toUpperCase() === mainCurrency;
    const toIsMain = dto.toCurrency.toUpperCase() === mainCurrency;

    // Verifier et debiter la source
    if (fromIsMain) {
      if (Number(account.balance) < dto.amount) {
        throw new BadRequestException(`Solde insuffisant en ${dto.fromCurrency}. Disponible: ${Number(account.balance)}`);
      }
    } else {
      const fromSub = await this.prisma.currencySubAccount.findUnique({
        where: { accountId_currencyId: { accountId: dto.accountId, currencyId: fromCurrency.id } },
      });
      if (!fromSub) throw new NotFoundException(`Aucun sous-compte ${dto.fromCurrency} pour ce compte`);
      if (Number(fromSub.balance) < dto.amount) {
        throw new BadRequestException(`Solde insuffisant en ${dto.fromCurrency}. Disponible: ${Number(fromSub.balance)}`);
      }
    }

    // Verifier que le sous-compte cible existe (sauf si c'est le compte principal)
    if (!toIsMain) {
      const toSub = await this.prisma.currencySubAccount.findUnique({
        where: { accountId_currencyId: { accountId: dto.accountId, currencyId: toCurrency.id } },
      });
      if (!toSub) throw new NotFoundException(`Aucun sous-compte ${dto.toCurrency}. Creez-le d'abord.`);
    }

    // Executer la conversion en transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Debiter la source
      if (fromIsMain) {
        await tx.account.update({
          where: { id: dto.accountId },
          data: { balance: { decrement: dto.amount } },
        });
      } else {
        await tx.currencySubAccount.update({
          where: { accountId_currencyId: { accountId: dto.accountId, currencyId: fromCurrency.id } },
          data: { balance: { decrement: dto.amount } },
        });
      }

      // Crediter la cible
      if (toIsMain) {
        await tx.account.update({
          where: { id: dto.accountId },
          data: { balance: { increment: convertedAmount } },
        });
      } else {
        await tx.currencySubAccount.update({
          where: { accountId_currencyId: { accountId: dto.accountId, currencyId: toCurrency.id } },
          data: { balance: { increment: convertedAmount } },
        });
      }

      // Creer une transaction de trace
      const transaction = await tx.transaction.create({
        data: {
          reference: `CONV-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          type: 'FEE',
          amount: dto.amount,
          fees,
          tax: 0,
          fromAccountId: dto.accountId,
          toAccountId: dto.accountId,
          agencyId: account.agencyId,
          status: 'COMPLETED',
          description: `Conversion ${dto.amount} ${dto.fromCurrency} -> ${convertedAmount} ${dto.toCurrency} (taux: ${effectiveRate})`,
        },
      });

      return transaction;
    });

    if (userId) {
      this.auditService.log({
        userId, action: 'CREATE', module: 'CURRENCIES',
        entityId: result.id, entityType: 'CurrencyConversion',
        details: `Conversion ${dto.amount} ${dto.fromCurrency} -> ${convertedAmount} ${dto.toCurrency} (taux ${effectiveRate}, frais ${fees})`,
      }).catch(() => {});
    }

    return {
      transactionId: result.id,
      reference: result.reference,
      fromCurrency: dto.fromCurrency,
      toCurrency: dto.toCurrency,
      originalAmount: dto.amount,
      fees,
      feePercentage,
      netAmount,
      exchangeRate: effectiveRate,
      convertedAmount,
      message: `Conversion effectuee : ${dto.amount} ${dto.fromCurrency} -> ${convertedAmount} ${dto.toCurrency}`,
    };
  }

  async simulateConversion(fromCurrency: string, toCurrency: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('Le montant doit etre positif');

    const rateInfo = await this.getCurrentRate(fromCurrency, toCurrency);
    const effectiveRate = rateInfo.sellRate || rateInfo.rate;
    const toCurr = await this.findCurrencyByCode(toCurrency);

    const fees = Math.round(amount * rateInfo.feePercentage / 100);
    const netAmount = amount - fees;
    const convertedAmount = this.roundForCurrency(netAmount * effectiveRate, toCurr.decimals);

    return {
      fromCurrency,
      toCurrency,
      amount,
      fees,
      feePercentage: rateInfo.feePercentage,
      netAmount,
      exchangeRate: effectiveRate,
      convertedAmount,
      rateDirection: rateInfo.direction,
      rateDate: rateInfo.validFrom,
    };
  }

  private roundForCurrency(amount: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(amount * factor) / factor;
  }
}
