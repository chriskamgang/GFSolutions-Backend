import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@prisma/client';
import {
  CreateSavingsProductDto,
  SubscribeSavingsDto,
  SavingsDepositDto,
  SavingsWithdrawalDto,
  OpenCashRegisterDto,
  CloseCashRegisterDto,
} from './dto/contribution.dto';

@Injectable()
export class ContributionsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==================== PRODUITS D'EPARGNE ====================

  async createProduct(dto: CreateSavingsProductDto) {
    const existing = await this.prisma.savingsProduct.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Un produit avec ce nom existe deja');
    }

    return this.prisma.savingsProduct.create({ data: dto });
  }

  async findAllProducts() {
    return this.prisma.savingsProduct.findMany({
      include: { _count: { select: { savingsAccounts: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOneProduct(id: string) {
    const product = await this.prisma.savingsProduct.findUnique({
      where: { id },
      include: { _count: { select: { savingsAccounts: true } } },
    });
    if (!product) throw new NotFoundException('Produit non trouve');
    return product;
  }

  async updateProduct(id: string, data: Partial<CreateSavingsProductDto>) {
    await this.findOneProduct(id);
    return this.prisma.savingsProduct.update({
      where: { id },
      data,
    });
  }

  // ==================== COMPTES EPARGNE ====================

  async subscribe(dto: SubscribeSavingsDto) {
    const product = await this.findOneProduct(dto.productId);

    // Calculer la prochaine date de cotisation si frequence definie
    let nextContributionDate: Date | null = null;
    if (product.contributionFrequency) {
      nextContributionDate = new Date();
      switch (product.contributionFrequency) {
        case 'DAILY':
          nextContributionDate.setDate(nextContributionDate.getDate() + 1);
          break;
        case 'WEEKLY':
          nextContributionDate.setDate(nextContributionDate.getDate() + 7);
          break;
        case 'MONTHLY':
          nextContributionDate.setMonth(nextContributionDate.getMonth() + 1);
          break;
      }
    }

    // Calculer date de maturite si epargne bloquee
    let maturityDate: Date | null = null;
    if (product.lockDurationMonths > 0) {
      maturityDate = new Date();
      maturityDate.setMonth(
        maturityDate.getMonth() + product.lockDurationMonths,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const savingsAccount = await tx.savingsAccount.create({
        data: {
          accountNumber: `EPG-${Date.now().toString().slice(-10)}`,
          clientId: dto.clientId,
          productId: dto.productId,
          agencyId: dto.agencyId,
          nextContributionDate,
          maturityDate,
        },
        include: { product: true, client: true },
      });

      // Depot initial si fourni
      if (dto.initialDeposit && dto.initialDeposit > 0) {
        if (dto.initialDeposit < Number(product.minDeposit)) {
          throw new BadRequestException(
            `Le depot minimum est de ${product.minDeposit} FCFA`,
          );
        }

        await tx.savingsAccount.update({
          where: { id: savingsAccount.id },
          data: {
            balance: dto.initialDeposit,
            totalDeposits: dto.initialDeposit,
          },
        });

        await tx.savingsContribution.create({
          data: {
            savingsAccountId: savingsAccount.id,
            type: 'DEPOSIT',
            amount: dto.initialDeposit,
            balanceAfter: dto.initialDeposit,
            description: 'Depot initial a l\'ouverture',
          },
        });
      }

      return savingsAccount;
    });
  }

  async findAllSavingsAccounts(params: {
    clientId?: string;
    agencyId?: string;
    productId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { clientId, agencyId, productId, status, page = 1, limit = 20 } = params;

    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (agencyId) where.agencyId = agencyId;
    if (productId) where.productId = productId;
    if (status) where.status = status;

    const [accounts, total] = await Promise.all([
      this.prisma.savingsAccount.findMany({
        where,
        include: { product: true, client: true, agency: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.savingsAccount.count({ where }),
    ]);

    return {
      data: accounts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneSavingsAccount(id: string) {
    const account = await this.prisma.savingsAccount.findUnique({
      where: { id },
      include: {
        product: true,
        client: true,
        agency: true,
        contributions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!account) throw new NotFoundException('Compte epargne non trouve');
    return account;
  }

  // ==================== DEPOT EPARGNE ====================

  async deposit(dto: SavingsDepositDto) {
    const account = await this.findOneSavingsAccount(dto.savingsAccountId);

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Ce compte epargne n\'est pas actif');
    }

    if (dto.amount < Number(account.product.minDeposit)) {
      throw new BadRequestException(
        `Le depot minimum est de ${account.product.minDeposit} FCFA`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const newBalance = Number(account.balance) + dto.amount;
      const newTotalDeposits = Number(account.totalDeposits) + dto.amount;

      await tx.savingsAccount.update({
        where: { id: dto.savingsAccountId },
        data: {
          balance: newBalance,
          totalDeposits: newTotalDeposits,
        },
      });

      // Mettre a jour la prochaine date de cotisation
      if (account.product.contributionFrequency) {
        let nextDate = new Date();
        switch (account.product.contributionFrequency) {
          case 'DAILY':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
          case 'WEEKLY':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'MONTHLY':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        }
        await tx.savingsAccount.update({
          where: { id: dto.savingsAccountId },
          data: { nextContributionDate: nextDate },
        });
      }

      const contribution = await tx.savingsContribution.create({
        data: {
          savingsAccountId: dto.savingsAccountId,
          type: 'DEPOSIT',
          amount: dto.amount,
          balanceAfter: newBalance,
          mobileMoneyProvider: dto.mobileMoneyProvider,
          mobileMoneyPhone: dto.mobileMoneyPhone,
          description: 'Cotisation epargne',
        },
      });

      return contribution;
    });
  }

  // ==================== RETRAIT EPARGNE ====================

  async withdrawal(dto: SavingsWithdrawalDto) {
    const account = await this.findOneSavingsAccount(dto.savingsAccountId);

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Ce compte epargne n\'est pas actif');
    }

    // Verifier si epargne bloquee
    if (
      account.maturityDate &&
      new Date() < new Date(account.maturityDate)
    ) {
      throw new BadRequestException(
        `Epargne bloquee jusqu'au ${new Date(account.maturityDate).toLocaleDateString('fr-FR')}`,
      );
    }

    // Verifier solde minimum
    const balanceAfter = Number(account.balance) - dto.amount;
    if (balanceAfter < Number(account.product.minBalance)) {
      throw new BadRequestException(
        `Solde minimum a maintenir : ${account.product.minBalance} FCFA`,
      );
    }

    if (dto.amount > Number(account.balance)) {
      throw new BadRequestException('Solde insuffisant');
    }

    return this.prisma.$transaction(async (tx) => {
      const newBalance = Number(account.balance) - dto.amount;
      const newTotalWithdrawals =
        Number(account.totalWithdrawals) + dto.amount;

      await tx.savingsAccount.update({
        where: { id: dto.savingsAccountId },
        data: {
          balance: newBalance,
          totalWithdrawals: newTotalWithdrawals,
        },
      });

      const contribution = await tx.savingsContribution.create({
        data: {
          savingsAccountId: dto.savingsAccountId,
          type: 'WITHDRAWAL',
          amount: dto.amount,
          balanceAfter: newBalance,
          mobileMoneyProvider: dto.mobileMoneyProvider,
          mobileMoneyPhone: dto.mobileMoneyPhone,
          description: 'Retrait epargne',
        },
      });

      return contribution;
    });
  }

  // ==================== HISTORIQUE ====================

  async getContributions(savingsAccountId: string, params: {
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { type, startDate, endDate, page = 1, limit = 20 } = params;

    const where: any = { savingsAccountId };
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [contributions, total] = await Promise.all([
      this.prisma.savingsContribution.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.savingsContribution.count({ where }),
    ]);

    return {
      data: contributions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==================== CAISSE ====================

  async openCashRegister(dto: OpenCashRegisterDto, userId: string) {
    // Verifier qu'il n'y a pas deja une caisse ouverte pour cet utilisateur
    const openRegister = await this.prisma.cashRegister.findFirst({
      where: { userId, status: 'OPEN' },
    });

    if (openRegister) {
      throw new ConflictException(
        'Vous avez deja une caisse ouverte. Fermez-la d\'abord.',
      );
    }

    const register = await this.prisma.cashRegister.create({
      data: {
        agencyId: dto.agencyId,
        userId,
        openingBalance: dto.openingBalance,
      },
      include: { agency: true, user: true },
    });

    this.auditService.log({
      userId, action: 'CREATE', module: 'TREASURY',
      entityId: register.id, entityType: 'CashRegister',
      details: `Ouverture caisse - Solde initial ${dto.openingBalance} FCFA - Agence ${register.agency.name}`,
    }).catch((e) => console.error('[AUDIT]', e.message));

    return register;
  }

  async closeCashRegister(dto: CloseCashRegisterDto, userId: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id: dto.cashRegisterId },
    });

    if (!register) throw new NotFoundException('Caisse non trouvee');
    if (register.status === 'CLOSED') {
      throw new BadRequestException('Cette caisse est deja fermee');
    }
    if (register.userId !== userId) {
      throw new BadRequestException(
        'Vous ne pouvez fermer que votre propre caisse',
      );
    }

    const expectedBalance =
      Number(register.openingBalance) +
      Number(register.totalDeposits) -
      Number(register.totalWithdrawals);

    const difference = dto.physicalBalance - expectedBalance;

    const closed = await this.prisma.cashRegister.update({
      where: { id: dto.cashRegisterId },
      data: {
        closingBalance: expectedBalance,
        physicalBalance: dto.physicalBalance,
        difference,
        status: 'CLOSED',
        notes: dto.notes,
        closedAt: new Date(),
      },
      include: { agency: true, user: true },
    });

    this.auditService.log({
      userId, action: 'UPDATE', module: 'TREASURY',
      entityId: closed.id, entityType: 'CashRegister',
      details: `Fermeture caisse - Theorique ${expectedBalance} FCFA, Physique ${dto.physicalBalance} FCFA, Ecart ${difference} FCFA`,
    }).catch((e) => console.error('[AUDIT]', e.message));

    return closed;
  }

  async getCashRegisters(params: {
    agencyId?: string;
    userId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { agencyId, userId, status, page = 1, limit = 20 } = params;

    const where: any = {};
    if (agencyId) where.agencyId = agencyId;
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const [registers, total] = await Promise.all([
      this.prisma.cashRegister.findMany({
        where,
        include: { agency: true, user: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cashRegister.count({ where }),
    ]);

    return {
      data: registers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
