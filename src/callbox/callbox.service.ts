import {
  Injectable, UnauthorizedException, ForbiddenException,
  BadRequestException, NotFoundException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterCallboxDto, CallboxLoginDto, CallboxDepositDto,
  CallboxWithdrawalDto, CallboxTransferDto, FloatTopupDto,
  UpdateCommissionConfigDto,
} from './dto/callbox.dto';

@Injectable()
export class CallboxService {
  private readonly logger = new Logger(CallboxService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ==================== AUTH ====================

  async register(dto: RegisterCallboxDto, createdBy?: string) {
    const existing = await this.prisma.callbox.findFirst({
      where: { OR: [{ phone: dto.phone }, { email: dto.email }] },
    });
    if (existing) {
      throw new BadRequestException('Un callbox avec ce téléphone ou email existe déjà');
    }

    const count = await this.prisma.callbox.count();
    const callboxNumber = `CBX-${String(count + 1).padStart(4, '0')}`;
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const callbox = await this.prisma.callbox.create({
      data: {
        callboxNumber,
        ownerName: dto.ownerName,
        businessName: dto.businessName,
        phone: dto.phone,
        email: dto.email,
        password: hashedPassword,
        city: dto.city,
        address: dto.address,
        agencyId: dto.agencyId,
        createdBy: createdBy ?? null,
        status: 'PENDING',
      },
      include: { agency: true },
    });

    const { password: _, ...result } = callbox;
    return result;
  }

  async login(dto: CallboxLoginDto) {
    const callbox = await this.prisma.callbox.findUnique({
      where: { phone: dto.phone },
      include: { agency: true },
    });

    if (!callbox) throw new UnauthorizedException('Téléphone ou mot de passe incorrect');
    if (callbox.status === 'PENDING') {
      throw new ForbiddenException('Votre compte Callbox est en attente d\'approbation par l\'admin');
    }
    if (callbox.status === 'REJECTED') {
      throw new ForbiddenException('Votre demande Callbox a été rejetée. Contactez votre agence.');
    }
    if (callbox.status === 'SUSPENDED') {
      throw new ForbiddenException('Votre compte Callbox est suspendu');
    }

    const isValid = await bcrypt.compare(dto.password, callbox.password);
    if (!isValid) throw new UnauthorizedException('Téléphone ou mot de passe incorrect');

    const sessionToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.callbox.update({
      where: { id: callbox.id },
      data: { lastLoginAt: new Date(), sessionToken },
    });

    const payload = {
      sub: callbox.id,
      callboxNumber: callbox.callboxNumber,
      agencyId: callbox.agencyId,
      sessionToken,
      type: 'CALLBOX',
    };

    const token = this.jwtService.sign(payload, { expiresIn: 43200 }); // 12h

    return {
      access_token: token,
      expiresIn: 43200,
      callbox: {
        id: callbox.id,
        callboxNumber: callbox.callboxNumber,
        ownerName: callbox.ownerName,
        businessName: callbox.businessName,
        phone: callbox.phone,
        city: callbox.city,
        agency: callbox.agency?.name,
        agencyId: callbox.agencyId,
        float: Number(callbox.float),
        commissionsEarned: Number(callbox.commissionsEarned),
        status: callbox.status,
      },
    };
  }

  async validateSession(callboxId: string, sessionToken: string): Promise<boolean> {
    const callbox = await this.prisma.callbox.findUnique({
      where: { id: callboxId },
      select: { sessionToken: true, status: true },
    });
    if (!callbox || callbox.status !== 'APPROVED') return false;
    return callbox.sessionToken === sessionToken;
  }

  // ==================== LOOKUP CLIENT ====================

  async lookupByQrOrAccount(identifier: string) {
    // Chercher par QR code d'abord
    const byQr = await this.prisma.client.findFirst({
      where: { qrCode: identifier },
      include: {
        accounts: {
          where: { status: 'ACTIVE', type: 'CURRENT' },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (byQr) return this._formatClientResult(byQr);

    // Puis par numéro de compte
    const byAccount = await this.prisma.account.findFirst({
      where: { accountNumber: identifier, status: 'ACTIVE' },
      include: { client: true },
    });

    if (byAccount) {
      return {
        clientId: byAccount.client.id,
        clientName: byAccount.client.firstName
          ? `${byAccount.client.firstName} ${byAccount.client.lastName}`
          : byAccount.client.raisonSociale,
        accountId: byAccount.id,
        accountNumber: byAccount.accountNumber,
        balance: Number(byAccount.balance),
      };
    }

    throw new NotFoundException('Client introuvable avec ce QR code ou numéro de compte');
  }

  private _formatClientResult(client: any) {
    const account = client.accounts?.[0];
    return {
      clientId: client.id,
      clientName: client.firstName
        ? `${client.firstName} ${client.lastName}`
        : client.raisonSociale,
      accountId: account?.id ?? null,
      accountNumber: account?.accountNumber ?? null,
      balance: account ? Number(account.balance) : 0,
    };
  }

  // ==================== DÉPÔT ====================

  async deposit(callboxId: string, dto: CallboxDepositDto) {
    const callbox = await this._getApprovedCallbox(callboxId);
    const clientInfo = await this.lookupByQrOrAccount(dto.identifier);

    if (!clientInfo.accountId) {
      throw new BadRequestException('Ce client n\'a pas de compte actif');
    }

    const amount = Math.floor(dto.amount);
    if (amount < 500) throw new BadRequestException('Montant minimum: 500 FCFA');

    // Vérifier que le float callbox est suffisant
    const floatBalance = Number(callbox.float);
    if (floatBalance < amount) {
      throw new BadRequestException(
        `Float insuffisant. Votre float: ${floatBalance.toLocaleString()} FCFA. Rechargez votre float.`,
      );
    }

    const { commission, callboxShare, gfsShare } = await this._calcCommission('DEPOSIT', amount);
    const reference = `CBX-DEP-${Date.now()}`;

    await this.prisma.$transaction([
      // Débiter le float callbox
      this.prisma.callbox.update({
        where: { id: callboxId },
        data: {
          float: { decrement: amount },
          commissionsEarned: { increment: callboxShare },
        },
      }),
      // Créditer le compte client
      this.prisma.account.update({
        where: { id: clientInfo.accountId },
        data: { balance: { increment: amount } },
      }),
      // Enregistrer la transaction callbox
      this.prisma.callboxTransaction.create({
        data: {
          reference,
          callboxId,
          type: 'DEPOSIT',
          clientAccountId: clientInfo.accountId,
          clientName: clientInfo.clientName ?? 'Client',
          amount,
          commission,
          callboxCommission: callboxShare,
          gfsCommission: gfsShare,
          notes: dto.notes,
          status: 'COMPLETED',
        },
      }),
      // Notification client
      this.prisma.notification.create({
        data: {
          targetType: 'CLIENT',
          targetId: clientInfo.clientId,
          title: 'Dépôt reçu',
          message: `Votre compte a été crédité de ${amount.toLocaleString()} FCFA via ${callbox.businessName ?? callbox.ownerName}`,
          channel: 'APP',
        },
      }),
    ]);

    return {
      success: true,
      reference,
      clientName: clientInfo.clientName,
      accountNumber: clientInfo.accountNumber,
      amount,
      commission,
      callboxCommission: callboxShare,
      newFloat: floatBalance - amount,
      message: `Dépôt de ${amount.toLocaleString()} FCFA effectué avec succès`,
    };
  }

  // ==================== RETRAIT ====================

  async withdrawal(callboxId: string, dto: CallboxWithdrawalDto) {
    await this._getApprovedCallbox(callboxId);
    const clientInfo = await this.lookupByQrOrAccount(dto.identifier);

    if (!clientInfo.accountId) {
      throw new BadRequestException('Ce client n\'a pas de compte actif');
    }

    const amount = Math.floor(dto.amount);
    if (clientInfo.balance < amount) {
      throw new BadRequestException(
        `Solde insuffisant. Solde client: ${clientInfo.balance.toLocaleString()} FCFA`,
      );
    }

    const { commission, callboxShare, gfsShare } = await this._calcCommission('WITHDRAWAL', amount);
    const reference = `CBX-WIT-${Date.now()}`;

    await this.prisma.$transaction([
      // Débiter le compte client
      this.prisma.account.update({
        where: { id: clientInfo.accountId },
        data: { balance: { decrement: amount } },
      }),
      // Créditer le float callbox
      this.prisma.callbox.update({
        where: { id: callboxId },
        data: {
          float: { increment: amount },
          commissionsEarned: { increment: callboxShare },
        },
      }),
      this.prisma.callboxTransaction.create({
        data: {
          reference,
          callboxId,
          type: 'WITHDRAWAL',
          clientAccountId: clientInfo.accountId,
          clientName: clientInfo.clientName ?? 'Client',
          amount,
          commission,
          callboxCommission: callboxShare,
          gfsCommission: gfsShare,
          notes: dto.notes,
          status: 'COMPLETED',
        },
      }),
      this.prisma.notification.create({
        data: {
          targetType: 'CLIENT',
          targetId: clientInfo.clientId,
          title: 'Retrait effectué',
          message: `Retrait de ${amount.toLocaleString()} FCFA effectué sur votre compte`,
          channel: 'APP',
        },
      }),
    ]);

    return {
      success: true,
      reference,
      clientName: clientInfo.clientName,
      accountNumber: clientInfo.accountNumber,
      amount,
      commission,
      callboxCommission: callboxShare,
      message: `Retrait de ${amount.toLocaleString()} FCFA effectué avec succès`,
    };
  }

  // ==================== TRANSFERT P2P ====================

  async transfer(callboxId: string, callboxAgencyId: string, dto: CallboxTransferDto) {
    const callbox = await this._getApprovedCallbox(callboxId);

    // Identifier le client source (le callbox lui-même est l'émetteur du float)
    const destInfo = await this.lookupByQrOrAccount(dto.destIdentifier);
    if (!destInfo.accountId) {
      throw new BadRequestException('Le destinataire n\'a pas de compte actif');
    }

    const amount = Math.floor(dto.amount);
    if (Number(callbox.float) < amount) {
      throw new BadRequestException(
        `Float insuffisant. Votre float: ${Number(callbox.float).toLocaleString()} FCFA`,
      );
    }

    const { commission, callboxShare, gfsShare } = await this._calcCommission('TRANSFER', amount);
    const reference = `CBX-TRF-${Date.now()}`;

    await this.prisma.$transaction([
      this.prisma.callbox.update({
        where: { id: callboxId },
        data: {
          float: { decrement: amount },
          commissionsEarned: { increment: callboxShare },
        },
      }),
      this.prisma.account.update({
        where: { id: destInfo.accountId },
        data: { balance: { increment: amount } },
      }),
      this.prisma.callboxTransaction.create({
        data: {
          reference,
          callboxId,
          type: 'TRANSFER',
          destAccountId: destInfo.accountId,
          clientName: destInfo.clientName ?? 'Destinataire',
          amount,
          commission,
          callboxCommission: callboxShare,
          gfsCommission: gfsShare,
          notes: dto.notes,
          status: 'COMPLETED',
        },
      }),
      this.prisma.notification.create({
        data: {
          targetType: 'CLIENT',
          targetId: destInfo.clientId,
          title: 'Virement reçu',
          message: `Vous avez reçu ${amount.toLocaleString()} FCFA via Callbox ${callbox.callboxNumber}`,
          channel: 'APP',
        },
      }),
    ]);

    return {
      success: true,
      reference,
      destName: destInfo.clientName,
      destAccount: destInfo.accountNumber,
      amount,
      commission,
      callboxCommission: callboxShare,
      newFloat: Number(callbox.float) - amount,
      message: `Transfert de ${amount.toLocaleString()} FCFA vers ${destInfo.clientName} effectué`,
    };
  }

  // ==================== FLOAT TOPUP ====================

  async floatTopup(dto: FloatTopupDto, processedById: string) {
    const callbox = await this.prisma.callbox.findUnique({ where: { id: dto.callboxId } });
    if (!callbox) throw new NotFoundException('Callbox introuvable');

    const amount = Math.floor(dto.amount);

    await this.prisma.$transaction([
      this.prisma.callbox.update({
        where: { id: dto.callboxId },
        data: { float: { increment: amount } },
      }),
      this.prisma.callboxFloatTopup.create({
        data: {
          callboxId: dto.callboxId,
          amount,
          method: dto.method,
          processedById,
          notes: dto.notes,
        },
      }),
      this.prisma.callboxTransaction.create({
        data: {
          reference: `CBX-TOP-${Date.now()}`,
          callboxId: dto.callboxId,
          type: 'FLOAT_TOPUP',
          clientName: 'GFS Admin',
          amount,
          commission: 0,
          callboxCommission: 0,
          gfsCommission: 0,
          notes: dto.notes ?? `Rechargement float — ${dto.method}`,
          status: 'COMPLETED',
        },
      }),
    ]);

    const updated = await this.prisma.callbox.findUnique({ where: { id: dto.callboxId } });
    return {
      success: true,
      newFloat: Number(updated!.float),
      message: `Float rechargé de ${amount.toLocaleString()} FCFA`,
    };
  }

  // ==================== ADMIN ====================

  async approve(callboxId: string, adminId: string) {
    const callbox = await this.prisma.callbox.findUnique({ where: { id: callboxId } });
    if (!callbox) throw new NotFoundException('Callbox introuvable');
    if (callbox.status !== 'PENDING') {
      throw new BadRequestException('Ce callbox n\'est pas en attente d\'approbation');
    }

    return this.prisma.callbox.update({
      where: { id: callboxId },
      data: { status: 'APPROVED', approvedById: adminId, approvedAt: new Date() },
      select: { id: true, callboxNumber: true, ownerName: true, status: true, approvedAt: true },
    });
  }

  async reject(callboxId: string, adminId: string) {
    const callbox = await this.prisma.callbox.findUnique({ where: { id: callboxId } });
    if (!callbox) throw new NotFoundException('Callbox introuvable');

    return this.prisma.callbox.update({
      where: { id: callboxId },
      data: { status: 'REJECTED' },
      select: { id: true, callboxNumber: true, ownerName: true, status: true },
    });
  }

  async suspend(callboxId: string) {
    return this.prisma.callbox.update({
      where: { id: callboxId },
      data: { status: 'SUSPENDED' },
      select: { id: true, callboxNumber: true, ownerName: true, status: true },
    });
  }

  async findAll(params: { status?: string; agencyId?: string; page?: number; limit?: number }) {
    const { status, agencyId, page = 1, limit = 20 } = params;
    const where: any = {};
    if (status) where.status = status;
    if (agencyId) where.agencyId = agencyId;

    const [data, total] = await Promise.all([
      this.prisma.callbox.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { agency: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.callbox.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(callboxId: string) {
    const callbox = await this.prisma.callbox.findUnique({
      where: { id: callboxId },
      include: {
        agency: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        floatTopups: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!callbox) throw new NotFoundException('Callbox introuvable');
    const { password: _, ...result } = callbox;
    return result;
  }

  async getStats(callboxId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [callbox, todayTx, totalTx] = await Promise.all([
      this.prisma.callbox.findUnique({ where: { id: callboxId }, select: { float: true, commissionsEarned: true } }),
      this.prisma.callboxTransaction.aggregate({
        where: { callboxId, createdAt: { gte: today }, type: { in: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'] } },
        _count: true,
        _sum: { amount: true, callboxCommission: true },
      }),
      this.prisma.callboxTransaction.aggregate({
        where: { callboxId, type: { in: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'] } },
        _count: true,
        _sum: { amount: true, callboxCommission: true },
      }),
    ]);

    return {
      float: Number(callbox?.float ?? 0),
      commissionsEarned: Number(callbox?.commissionsEarned ?? 0),
      today: {
        count: todayTx._count,
        volume: Number(todayTx._sum.amount ?? 0),
        commissions: Number(todayTx._sum.callboxCommission ?? 0),
      },
      total: {
        count: totalTx._count,
        volume: Number(totalTx._sum.amount ?? 0),
        commissions: Number(totalTx._sum.callboxCommission ?? 0),
      },
    };
  }

  async getTransactions(callboxId: string, params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    const [data, total] = await Promise.all([
      this.prisma.callboxTransaction.findMany({
        where: { callboxId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.callboxTransaction.count({ where: { callboxId } }),
    ]);
    return { data, total, page, limit };
  }

  // ==================== COMMISSION CONFIG ====================

  async getCommissionConfigs() {
    return this.prisma.callboxCommissionConfig.findMany();
  }

  async upsertCommissionConfig(type: string, dto: UpdateCommissionConfigDto) {
    return this.prisma.callboxCommissionConfig.upsert({
      where: { transactionType: type as any },
      update: { rate: dto.rate, callboxShareRate: dto.callboxShareRate },
      create: {
        transactionType: type as any,
        rate: dto.rate,
        callboxShareRate: dto.callboxShareRate,
      },
    });
  }

  // ==================== HELPER ====================

  private async _getApprovedCallbox(callboxId: string) {
    const callbox = await this.prisma.callbox.findUnique({ where: { id: callboxId } });
    if (!callbox) throw new NotFoundException('Callbox introuvable');
    if (callbox.status !== 'APPROVED') throw new ForbiddenException('Callbox non approuvé');
    return callbox;
  }

  private async _calcCommission(type: string, amount: number) {
    const config = await this.prisma.callboxCommissionConfig.findUnique({
      where: { transactionType: type as any },
    });

    if (!config || !config.isActive) {
      return { commission: 0, callboxShare: 0, gfsShare: 0 };
    }

    const commission = Math.floor(amount * Number(config.rate));
    const callboxShare = Math.floor(commission * Number(config.callboxShareRate));
    const gfsShare = commission - callboxShare;
    return { commission, callboxShare, gfsShare };
  }

  async getMe(callboxId: string) {
    const callbox = await this.prisma.callbox.findUnique({
      where: { id: callboxId },
      include: { agency: { select: { name: true } } },
    });
    if (!callbox) throw new NotFoundException('Callbox introuvable');
    const { password: _, sessionToken: __, ...result } = callbox;
    return result;
  }
}
