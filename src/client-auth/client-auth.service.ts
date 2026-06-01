import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ClientLoginDto, ClientRegisterPinDto, ClientChangePinDto, ClientChangePasswordDto } from './dto/client-auth.dto';

@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);
  private loginAttempts = new Map<string, { count: number; lockedUntil: Date | null }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Login client par telephone/code adherent + mot de passe ou PIN
   */
  async login(dto: ClientLoginDto) {
    const attempt = this.loginAttempts.get(dto.identifier);
    if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
      const remainingMs = attempt.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new ForbiddenException(
        `Compte temporairement bloque suite a trop de tentatives. Reessayez dans ${remainingMin} minute(s).`,
      );
    }

    // Chercher par telephone ou code adherent
    const client = await this.prisma.client.findFirst({
      where: {
        OR: [
          { phone: dto.identifier },
          { clientNumber: dto.identifier },
        ],
      },
      include: { agency: true },
    });

    if (!client) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }

    if (client.status !== 'ACTIVE') {
      throw new ForbiddenException('Votre compte est suspendu ou bloque. Contactez votre agence.');
    }

    // Verifier mot de passe OU PIN
    if (!client.password && !client.pin) {
      throw new BadRequestException(
        'Votre compte n\'a pas encore de mot de passe. Rendez-vous en agence pour activer votre acces mobile.',
      );
    }

    let authenticated = false;

    // Essayer d'abord le mot de passe
    if (client.password) {
      authenticated = await bcrypt.compare(dto.password, client.password);
    }

    // Si pas de match avec mot de passe, essayer le PIN
    if (!authenticated && client.pin) {
      authenticated = await bcrypt.compare(dto.password, client.pin);
    }

    if (!authenticated) {
      const current = this.loginAttempts.get(dto.identifier) || { count: 0, lockedUntil: null };
      current.count += 1;
      if (current.count >= 5) {
        current.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        this.logger.warn(`Compte ${dto.identifier} bloque pour 15 minutes apres ${current.count} tentatives echouees`);
      }
      this.loginAttempts.set(dto.identifier, current);
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }

    this.loginAttempts.delete(dto.identifier);

    // 2FA check
    if (client.twoFactorEnabled && client.twoFactorSecret) {
      if (!dto.totpCode) {
        return { requires2FA: true, message: 'Code 2FA requis' };
      }
      const { verify } = await import('otplib');
      const isValid = verify({ token: dto.totpCode, secret: client.twoFactorSecret });
      if (!isValid) {
        throw new UnauthorizedException('Code 2FA invalide');
      }
    }

    // Session token unique
    const sessionToken = crypto.randomBytes(32).toString('hex');

    await this.prisma.client.update({
      where: { id: client.id },
      data: { sessionToken },
    });

    const expiresIn = 3600; // 1h pour les clients

    const payload = {
      sub: client.id,
      phone: client.phone,
      clientNumber: client.clientNumber,
      clientType: client.clientType,
      agencyId: client.agencyId,
      sessionToken,
      type: 'client', // distinguer client vs staff dans le JWT
    };

    return {
      access_token: this.jwtService.sign(payload, { expiresIn }),
      expiresIn,
      client: {
        id: client.id,
        clientNumber: client.clientNumber,
        clientType: client.clientType,
        phone: client.phone,
        email: client.email,
        firstName: client.firstName,
        lastName: client.lastName,
        raisonSociale: client.raisonSociale,
        profilePhoto: client.profilePhoto,
        agency: client.agency?.name,
        agencyId: client.agencyId,
        twoFactorEnabled: client.twoFactorEnabled,
      },
    };
  }

  /**
   * Valider le session token client
   */
  async validateClientSession(clientId: string, sessionToken: string): Promise<boolean> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { sessionToken: true, status: true },
    });
    if (!client || client.status !== 'ACTIVE') return false;
    return client.sessionToken === sessionToken;
  }

  /**
   * Profil client connecte
   */
  async getProfile(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        agency: true,
        accounts: {
          where: { status: 'ACTIVE' },
          select: { id: true, accountNumber: true, type: true, balance: true, status: true, createdAt: true },
        },
      },
    });

    if (!client) throw new NotFoundException('Client non trouve');

    return {
      id: client.id,
      clientNumber: client.clientNumber,
      clientType: client.clientType,
      phone: client.phone,
      email: client.email,
      firstName: client.firstName,
      lastName: client.lastName,
      raisonSociale: client.raisonSociale,
      profilePhoto: client.profilePhoto,
      address: client.address,
      city: client.city,
      region: client.region,
      agency: client.agency?.name,
      agencyId: client.agencyId,
      twoFactorEnabled: client.twoFactorEnabled,
      kycVerified: client.kycVerified,
      accounts: client.accounts,
      createdAt: client.createdAt,
    };
  }

  /**
   * Enregistrer PIN + mot de passe (premiere activation)
   */
  async registerCredentials(clientId: string, dto: ClientRegisterPinDto) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client non trouve');

    const hashedPin = await bcrypt.hash(dto.pin, 10);
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.prisma.client.update({
      where: { id: clientId },
      data: { pin: hashedPin, password: hashedPassword },
    });

    return { message: 'PIN et mot de passe enregistres avec succes' };
  }

  /**
   * Changer le PIN
   */
  async changePin(clientId: string, dto: ClientChangePinDto) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client || !client.pin) throw new BadRequestException('PIN non configure');

    const isValid = await bcrypt.compare(dto.oldPin, client.pin);
    if (!isValid) throw new UnauthorizedException('Ancien PIN incorrect');

    const hashedPin = await bcrypt.hash(dto.newPin, 10);
    await this.prisma.client.update({
      where: { id: clientId },
      data: { pin: hashedPin },
    });

    return { message: 'PIN modifie avec succes' };
  }

  /**
   * Changer le mot de passe
   */
  async changePassword(clientId: string, dto: ClientChangePasswordDto) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client || !client.password) throw new BadRequestException('Mot de passe non configure');

    const isValid = await bcrypt.compare(dto.oldPassword, client.password);
    if (!isValid) throw new UnauthorizedException('Ancien mot de passe incorrect');

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.client.update({
      where: { id: clientId },
      data: { password: hashedPassword, sessionToken: null },
    });

    return { message: 'Mot de passe modifie. Veuillez vous reconnecter.' };
  }

  /**
   * Deconnexion
   */
  async logout(clientId: string) {
    await this.prisma.client.update({
      where: { id: clientId },
      data: { sessionToken: null },
    });
    return { message: 'Deconnecte' };
  }

  /**
   * Comptes du client
   */
  async getMyAccounts(clientId: string) {
    return this.prisma.account.findMany({
      where: { clientId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Transactions du client
   */
  async getMyTransactions(clientId: string, query: { limit?: number; page?: number; accountId?: string }) {
    const limit = query.limit || 20;
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    // Obtenir tous les comptes du client
    const accounts = await this.prisma.account.findMany({
      where: { clientId },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const where: any = {
      OR: [
        { fromAccountId: { in: accountIds } },
        { toAccountId: { in: accountIds } },
      ],
    };

    if (query.accountId) {
      where.OR = [
        { fromAccountId: query.accountId },
        { toAccountId: query.accountId },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          fromAccount: { select: { accountNumber: true } },
          toAccount: { select: { accountNumber: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Credits du client
   */
  async getMyCredits(clientId: string) {
    return this.prisma.credit.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Notifications du client
   */
  async getMyNotifications(clientId: string, limit = 30) {
    const [data, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { targetId: clientId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.notification.count({
        where: { targetId: clientId, isRead: false },
      }),
    ]);
    return { data, unreadCount };
  }

  /**
   * Echeances d'un credit du client
   */
  async getMyRepayments(clientId: string, creditId: string) {
    // Verifier que le credit appartient au client
    const credit = await this.prisma.credit.findFirst({
      where: { id: creditId, clientId },
    });
    if (!credit) throw new NotFoundException('Credit non trouve');

    const repayments = await this.prisma.repayment.findMany({
      where: { creditId },
      orderBy: { dueDate: 'asc' },
    });

    return {
      credit: {
        id: credit.id,
        reference: credit.creditNumber,
        amount: credit.amount,
        remainingAmount: credit.remainingAmount,
        monthlyPayment: credit.monthlyPayment,
        status: credit.status,
      },
      repayments: repayments.map(r => ({
        id: r.id,
        dueDate: r.dueDate,
        amount: Number(r.amount),
        paidAmount: Number(r.paidAmount),
        penalty: Number(r.penalty),
        moratoireAmount: Number(r.moratoireAmount),
        status: r.status,
        paidAt: r.paidAt,
        remainingToPay: Number(r.amount) + Number(r.penalty) + Number(r.moratoireAmount) - Number(r.paidAmount),
      })),
      summary: {
        totalEcheances: repayments.length,
        echeancesPaid: repayments.filter(r => r.status === 'PAID').length,
        echeancesPending: repayments.filter(r => r.status === 'PENDING' || r.status === 'LATE' || r.status === 'PARTIAL').length,
        prochainEcheance: repayments.find(r => r.status === 'PENDING' || r.status === 'LATE' || r.status === 'PARTIAL'),
      },
    };
  }

  /**
   * Virement GFS entre comptes (initié par le client en ligne)
   */
  async transfer(
    clientId: string,
    dto: { fromAccountId: string; toAccountNumber: string; amount: number; description?: string },
  ) {
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('Montant invalide');

    const fromAccount = await this.prisma.account.findFirst({
      where: { id: dto.fromAccountId, clientId, status: 'ACTIVE' },
    });
    if (!fromAccount) throw new NotFoundException('Compte source introuvable');
    if (Number(fromAccount.balance) < dto.amount) {
      throw new BadRequestException(
        `Solde insuffisant. Disponible : ${Number(fromAccount.balance).toLocaleString('fr-FR')} FCFA`,
      );
    }

    const toAccount = await this.prisma.account.findFirst({
      where: { accountNumber: dto.toAccountNumber, status: 'ACTIVE' },
    });
    if (!toAccount) throw new NotFoundException('Compte destinataire introuvable ou inactif');
    if (toAccount.id === fromAccount.id) throw new BadRequestException('Le compte source et destinataire sont identiques');

    const reference = 'VIR' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: fromAccount.id }, data: { balance: { decrement: dto.amount } } });
      await tx.account.update({ where: { id: toAccount.id }, data: { balance: { increment: dto.amount } } });

      const transaction = await tx.transaction.create({
        data: {
          reference,
          type: 'TRANSFER',
          amount: dto.amount,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          agencyId: fromAccount.agencyId,
          status: 'COMPLETED',
          description: dto.description || 'Virement GFS en ligne',
        },
      });

      await tx.notification.create({
        data: {
          targetType: 'CLIENT',
          targetId: clientId,
          title: 'Virement effectué',
          message: `Virement de ${Number(dto.amount).toLocaleString('fr-FR')} FCFA vers ${dto.toAccountNumber} effectué. Réf : ${reference}`,
          channel: 'SYSTEM',
        },
      });

      if (toAccount.clientId !== clientId) {
        await tx.notification.create({
          data: {
            targetType: 'CLIENT',
            targetId: toAccount.clientId,
            title: 'Virement reçu',
            message: `Vous avez reçu ${Number(dto.amount).toLocaleString('fr-FR')} FCFA depuis un compte GFS. Réf : ${reference}`,
            channel: 'SYSTEM',
          },
        });
      }

      return transaction;
    });

    return { success: true, reference: result.reference, message: `Virement de ${Number(dto.amount).toLocaleString('fr-FR')} FCFA effectué avec succès. Réf : ${result.reference}` };
  }

  /**
   * Marquer notifications comme lues
   */
  async markNotificationsRead(clientId: string) {
    await this.prisma.notification.updateMany({
      where: { targetId: clientId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  /**
   * Payer une echeance de credit depuis un compte client
   */
  async payMyRepayment(clientId: string, repaymentId: string, accountId: string) {
    // Verifier que le repayment appartient a un credit du client
    const repayment = await this.prisma.repayment.findUnique({
      where: { id: repaymentId },
      include: { credit: true },
    });
    if (!repayment || repayment.credit.clientId !== clientId) {
      throw new NotFoundException('Echeance non trouvee');
    }
    if (repayment.status === 'PAID') {
      throw new BadRequestException('Cette echeance est deja payee');
    }

    // Verifier que le compte appartient au client
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, clientId, status: 'ACTIVE' },
    });
    if (!account) throw new NotFoundException('Compte non trouve');

    // Calculer le montant total du (capital + penalty + moratoire - deja paye)
    const totalDue = Number(repayment.amount) + Number(repayment.penalty) + Number(repayment.moratoireAmount) - Number(repayment.paidAmount);

    if (Number(account.balance) < totalDue) {
      throw new BadRequestException(`Solde insuffisant. Requis: ${totalDue} FCFA, Disponible: ${Number(account.balance)} FCFA`);
    }

    // Transaction atomique: debiter le compte + marquer l'echeance payee
    const result = await this.prisma.$transaction(async (tx) => {
      // Debiter le compte client
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { decrement: totalDue } },
      });

      // Crediter le montant au credit
      await tx.credit.update({
        where: { id: repayment.creditId },
        data: { remainingAmount: { decrement: Number(repayment.amount) } },
      });

      // Mettre a jour l'echeance
      const updatedRepayment = await tx.repayment.update({
        where: { id: repaymentId },
        data: {
          paidAmount: { increment: totalDue },
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      // Verifier si toutes les echeances sont payees
      const pendingCount = await tx.repayment.count({
        where: { creditId: repayment.creditId, status: { not: 'PAID' } },
      });

      if (pendingCount === 0) {
        await tx.credit.update({
          where: { id: repayment.creditId },
          data: { status: 'COMPLETED' },
        });
      }

      return updatedRepayment;
    });

    return { message: 'Echeance payee avec succes', repayment: result };
  }
}
