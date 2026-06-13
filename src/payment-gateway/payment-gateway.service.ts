import {
  Injectable, Logger, BadRequestException,
  NotFoundException, UnauthorizedException, ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SmsService } from '../sms/sms.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

function generateApiKey(): string {
  return 'gfs_' + crypto.randomBytes(24).toString('hex');
}

function generatePaymentRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'PAY-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private readonly paymentBaseUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private whatsappService: WhatsappService,
    private smsService: SmsService,
  ) {
    this.paymentBaseUrl = this.configService.get<string>(
      'PAYMENT_GATEWAY_URL',
      'https://pay.gfsolutions.cm',
    );
  }

  // ==================== GESTION MARCHANDS (admin) ====================

  async registerMerchant(dto: {
    name: string;
    email: string;
    phone?: string;
    website?: string;
    description?: string;
    type?: string;
    webhookUrl?: string;
    returnUrl?: string;
    accountId: string;
    agencyId: string;
    commissionDepotPct?: number;
    commissionRetraitPct?: number;
  }, createdById: string) {
    const existing = await this.prisma.merchant.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Un marchand avec cet email existe deja');

    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account) throw new NotFoundException('Compte GFS introuvable');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Le compte doit etre actif');

    const apiKey = generateApiKey();
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const apiSecret = await bcrypt.hash(rawSecret, 10);

    const merchant = await this.prisma.merchant.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        description: dto.description,
        webhookUrl: dto.webhookUrl,
        returnUrl: dto.returnUrl,
        accountId: dto.accountId,
        agencyId: dto.agencyId,
        type: (dto.type as any) || 'PAYMENT',
        commissionDepotPct: dto.commissionDepotPct ?? 0,
        commissionRetraitPct: dto.commissionRetraitPct ?? 0,
        apiKey,
        apiSecret,
        createdById,
        status: 'ACTIVE',
      },
    });

    return {
      ...merchant,
      apiSecret: rawSecret, // retourné une seule fois en clair
      message: 'Conservez bien le apiSecret, il ne sera plus affiché.',
    };
  }

  async listMerchants(query: { status?: string; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          account: { select: { accountNumber: true, balance: true } },
          agency: { select: { name: true } },
          _count: { select: { payments: true } },
        },
      }),
      this.prisma.merchant.count({ where }),
    ]);

    // Compter les clients onboardés par marchand via partnerSource
    const enriched = await Promise.all(
      data.map(async (m) => {
        const partnerSource = m.name.toUpperCase().replace(/\s+/g, '_');
        const onboardedClients = await this.prisma.client.count({
          where: { partnerSource },
        });
        return { ...m, onboardedClients };
      }),
    );

    return { data: enriched, total, page, limit };
  }

  async getMerchantById(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        account: { select: { accountNumber: true, balance: true } },
        agency: { select: { name: true } },
        _count: { select: { payments: true } },
      },
    });
    if (!merchant) throw new NotFoundException('Marchand introuvable');
    const partnerSource = merchant.name.toUpperCase().replace(/\s+/g, '_');
    const onboardedClients = await this.prisma.client.count({ where: { partnerSource } });
    return { ...merchant, onboardedClients };
  }

  async updateMerchantStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Marchand introuvable');
    return this.prisma.merchant.update({ where: { id }, data: { status } });
  }

  async updateMerchant(id: string, dto: {
    name?: string;
    phone?: string;
    website?: string;
    description?: string;
    type?: string;
    webhookUrl?: string;
    returnUrl?: string;
    commissionDepotPct?: number;
    commissionRetraitPct?: number;
  }) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Marchand introuvable');
    return this.prisma.merchant.update({ where: { id }, data: dto as any });
  }

  async regenerateApiKeys(id: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Marchand introuvable');

    const apiKey = generateApiKey();
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const apiSecret = await bcrypt.hash(rawSecret, 10);

    await this.prisma.merchant.update({ where: { id }, data: { apiKey, apiSecret } });

    return {
      apiKey,
      apiSecret: rawSecret,
      message: 'Nouvelles cles generees. Conservez le apiSecret, il ne sera plus affiché.',
    };
  }

  async getMerchantByApiKey(apiKey: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { apiKey } });
    if (!merchant || merchant.status !== 'ACTIVE') return null;
    return merchant;
  }

  // ==================== CREATION PAIEMENT (marchand) ====================

  async createPayment(merchantId: string, dto: {
    amount: number;
    orderId: string;
    type?: 'DEPOT' | 'RETRAIT';
    description?: string;
    callbackUrl?: string;
    returnUrl?: string;
    metadata?: string;
    expiresInMinutes?: number;
  }) {
    if (dto.amount < 100) throw new BadRequestException('Montant minimum : 100 FCFA');

    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || merchant.status !== 'ACTIVE') throw new ForbiddenException('Marchand inactif');
    if (merchant.type === 'ONBOARDING') throw new ForbiddenException('Ce marchand est de type ONBOARDING et ne peut pas creer de paiements. Contactez GFS pour passer en type PAYMENT ou BOTH.');

    const paymentRef = generatePaymentRef();
    const expiresAt = new Date(Date.now() + (dto.expiresInMinutes || 30) * 60 * 1000);

    const payment = await this.prisma.paymentRequest.create({
      data: {
        paymentRef,
        merchantId,
        amount: dto.amount,
        currency: 'XAF',
        type: dto.type || 'DEPOT',
        orderId: dto.orderId,
        description: dto.description,
        callbackUrl: dto.callbackUrl || merchant.webhookUrl,
        returnUrl: dto.returnUrl || merchant.returnUrl,
        metadata: dto.metadata,
        expiresAt,
        status: 'PENDING',
      },
    });

    const paymentUrl = `${this.paymentBaseUrl}/pay/${paymentRef}`;

    this.logger.log(`[GatewayPay] Paiement cree: ${paymentRef} — ${dto.amount} XAF — Marchand: ${merchant.name}`);

    return {
      paymentRef,
      paymentUrl,
      amount: dto.amount,
      currency: 'XAF',
      orderId: dto.orderId,
      expiresAt,
      status: 'PENDING',
      id: payment.id,
    };
  }

  // ==================== DETAIL PAIEMENT PUBLIC (page checkout) ====================

  async getPaymentDetails(paymentRef: string) {
    const payment = await this.prisma.paymentRequest.findUnique({
      where: { paymentRef },
      include: {
        merchant: {
          select: { name: true, logoUrl: true, website: true },
        },
      },
    });

    if (!payment) throw new NotFoundException('Lien de paiement invalide');

    // Vérifier expiration
    if (payment.status === 'PENDING' && new Date() > payment.expiresAt) {
      await this.prisma.paymentRequest.update({
        where: { paymentRef },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Ce lien de paiement a expire');
    }

    if (payment.status !== 'PENDING') {
      return {
        paymentRef: payment.paymentRef,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        merchant: payment.merchant,
        paidAt: payment.paidAt,
      };
    }

    return {
      paymentRef: payment.paymentRef,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      description: payment.description,
      orderId: payment.orderId,
      merchant: payment.merchant,
      expiresAt: payment.expiresAt,
    };
  }

  // ==================== CONFIRMATION PAIEMENT (client sur la page) ====================

  async confirmPayment(paymentRef: string, clientNumber: string, pin: string, ipAddress?: string) {
    const payment = await this.prisma.paymentRequest.findUnique({
      where: { paymentRef },
      include: { merchant: true },
    });

    if (!payment) throw new NotFoundException('Lien de paiement invalide');
    if (payment.status !== 'PENDING') throw new BadRequestException(`Paiement deja ${payment.status.toLowerCase()}`);
    if (new Date() > payment.expiresAt) {
      await this.prisma.paymentRequest.update({ where: { paymentRef }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('Ce lien de paiement a expire');
    }

    // Authentifier le client
    const client = await this.prisma.client.findUnique({
      where: { clientNumber },
      include: {
        accounts: {
          where: { status: 'ACTIVE', type: 'CURRENT' },
          orderBy: { balance: 'desc' },
          take: 1,
        },
      },
    });

    if (!client) throw new UnauthorizedException('Numero client invalide');
    if (client.status !== 'ACTIVE') throw new UnauthorizedException('Compte client suspendu');
    if (!client.pin) throw new BadRequestException('PIN non configure. Connectez-vous a l\'application mobile pour le configurer.');

    const pinValid = await bcrypt.compare(pin, client.pin);
    if (!pinValid) throw new UnauthorizedException('PIN incorrect');

    const account = client.accounts[0];
    if (!account) throw new BadRequestException('Aucun compte courant actif trouve pour ce client');

    const amount = Number(payment.amount);
    const commissionRate = payment.type === 'RETRAIT'
      ? Number(payment.merchant.commissionRetraitPct)
      : Number(payment.merchant.commissionDepotPct);
    const commission = Math.round(amount * commissionRate / 100);
    const totalDebit = amount + commission;

    if (Number(account.balance) < totalDebit) {
      throw new BadRequestException(
        `Solde insuffisant. Solde disponible : ${Number(account.balance).toLocaleString('fr-FR')} FCFA, montant requis : ${totalDebit.toLocaleString('fr-FR')} FCFA`
      );
    }

    // Exécuter le paiement (transaction atomique)
    const reference = `PAY-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    await this.prisma.$transaction(async (tx) => {
      // Débiter le client
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { decrement: totalDebit } },
      });

      // Créditer le marchand
      await tx.account.update({
        where: { id: payment.merchant.accountId },
        data: { balance: { increment: amount } },
      });

      // Créer la transaction GFS
      const transaction = await tx.transaction.create({
        data: {
          reference,
          type: 'TRANSFER',
          amount,
          fees: commission,
          tax: 0,
          fromAccountId: account.id,
          toAccountId: payment.merchant.accountId,
          agencyId: payment.merchant.agencyId,
          status: 'COMPLETED',
          description: `Paiement marchand ${payment.merchant.name} — Ref: ${paymentRef}`,
        },
      });

      // Mettre à jour le PaymentRequest
      await tx.paymentRequest.update({
        where: { paymentRef },
        data: {
          status: 'COMPLETED',
          clientId: client.id,
          transactionId: transaction.id,
          paidAt: new Date(),
          ipAddress,
        },
      });
    });

    // Envoyer le webhook au marchand (async, sans bloquer)
    this.sendWebhook(paymentRef).catch((e) =>
      this.logger.warn(`[GatewayPay] Webhook echec pour ${paymentRef}: ${e.message}`)
    );

    const returnUrl = payment.returnUrl;
    this.logger.log(`[GatewayPay] Paiement CONFIRME: ${paymentRef} — ${amount} XAF — Client: ${clientNumber}`);

    return {
      success: true,
      paymentRef,
      amount,
      currency: 'XAF',
      merchantName: payment.merchant.name,
      reference,
      returnUrl,
      message: 'Paiement effectue avec succes',
    };
  }

  // ==================== STATUT PAIEMENT (marchand) ====================

  async getPaymentStatus(paymentRef: string, merchantId: string) {
    const payment = await this.prisma.paymentRequest.findUnique({
      where: { paymentRef },
      include: { client: { select: { clientNumber: true, firstName: true, lastName: true } } },
    });

    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.merchantId !== merchantId) throw new ForbiddenException('Acces refuse');

    return {
      paymentRef: payment.paymentRef,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt,
      transactionId: payment.transactionId,
      description: payment.description,
    };
  }

  async listMerchantPayments(merchantId: string, query: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = { merchantId };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.paymentRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          paymentRef: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          description: true,
          paidAt: true,
          createdAt: true,
          webhookSent: true,
        },
      }),
      this.prisma.paymentRequest.count({ where }),
    ]);

    // Statistiques
    const stats = await this.prisma.paymentRequest.groupBy({
      by: ['status'],
      where: { merchantId },
      _sum: { amount: true },
      _count: { id: true },
    });

    return { data, total, page, limit, stats };
  }

  // ==================== WEBHOOK MARCHAND ====================

  private async sendWebhook(paymentRef: string) {
    const payment = await this.prisma.paymentRequest.findUnique({
      where: { paymentRef },
      include: { merchant: true },
    });

    if (!payment || !payment.callbackUrl) return;

    const payload = {
      event: 'payment.completed',
      paymentRef: payment.paymentRef,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt,
      transactionId: payment.transactionId,
      metadata: payment.metadata ? JSON.parse(payment.metadata) : null,
    };

    // Signature HMAC-SHA256 avec le apiSecret (stocké hashé, on signe avec le paymentRef + amount)
    const signaturePayload = `${payment.paymentRef}:${Number(payment.amount)}:${payment.orderId}`;
    const signature = crypto
      .createHmac('sha256', payment.merchant.apiKey) // on utilise apiKey comme clé HMAC
      .update(signaturePayload)
      .digest('hex');

    try {
      const res = await fetch(payment.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GFS-Signature': `sha256=${signature}`,
          'X-GFS-PaymentRef': payment.paymentRef,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      await this.prisma.paymentRequest.update({
        where: { paymentRef },
        data: { webhookSent: true, webhookStatus: res.status },
      });

      this.logger.log(`[GatewayPay] Webhook envoye: ${paymentRef} → ${res.status}`);
    } catch (err) {
      this.logger.warn(`[GatewayPay] Webhook echec: ${paymentRef} → ${err.message}`);
    }
  }

  // ==================== ONBOARDING PARTENAIRE (creation auto client) ====================

  private generateClientNumber(): string {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `CLI-${timestamp}${random}`;
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private async generateAccountNumber(agencyId: string, productCode: string): Promise<string> {
    const agency = await this.prisma.agency.findUnique({ where: { id: agencyId } });
    const agencyCode = agency?.code || '001';
    const count = await this.prisma.account.count({
      where: { agencyId, product: { code: productCode } },
    });
    const chrono = (count + 1).toString().padStart(6, '0');
    return `${agencyCode}-${productCode}-${chrono}`;
  }

  async partnerOnboardClient(merchantId: string, dto: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    gender?: 'M' | 'F';
    dateOfBirth?: string;
    address?: string;
    city?: string;
    region?: string;
    partnerUserId?: string;
    metadata?: string;
  }) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || merchant.status !== 'ACTIVE') throw new ForbiddenException('Marchand inactif');
    if (merchant.type === 'PAYMENT') throw new ForbiddenException('Ce marchand est de type PAYMENT et ne peut pas onboarder des clients. Contactez GFS pour passer en type ONBOARDING ou BOTH.');

    // Nettoyer le telephone
    let phone = dto.phone.replace(/[\s\-\.]/g, '');
    if (!phone.startsWith('+237')) {
      phone = phone.startsWith('237') ? `+${phone}` : `+237${phone}`;
    }

    // Verifier doublon par telephone
    const existing = await this.prisma.client.findFirst({ where: { phone } });
    if (existing) {
      this.logger.log(`[PartnerOnboard] Client existant: ${existing.clientNumber} — tel: ${phone}`);
      return {
        success: true,
        alreadyExists: true,
        clientNumber: existing.clientNumber,
        message: 'Ce client possede deja un compte GFSolutions.',
      };
    }

    // Trouver le produit compte courant
    const product = await this.prisma.accountProduct.findFirst({
      where: { type: 'CURRENT', isActive: true },
    });
    if (!product) throw new BadRequestException('Aucun produit de compte courant actif configure');

    // Onboarding partenaire = gratuit (pas de frais, pas de depot minimum)

    // Generer identifiants
    const clientNumber = this.generateClientNumber();
    const rawPassword = this.generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const rawPin = Math.floor(1000 + Math.random() * 9000).toString();
    const hashedPin = await bcrypt.hash(rawPin, 10);

    // Transaction atomique
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Creer le client
      const client = await tx.client.create({
        data: {
          clientNumber,
          clientType: 'PHYSIQUE',
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone,
          email: dto.email,
          gender: dto.gender as any,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          address: dto.address || 'A completer',
          city: dto.city || 'Douala',
          region: dto.region || 'Littoral',
          agencyId: merchant.agencyId,
          language: 'FR',
          qrCode: uuidv4(),
          password: hashedPassword,
          pin: hashedPin,
          partnerSource: merchant.name.toUpperCase().replace(/\s+/g, '_'),
          partnerUserId: dto.partnerUserId,
          kycScore: 10,
          kycScoreLabel: 'Insuffisant',
        },
      });

      // 2. Creer le compte courant
      const accountNumber = await this.generateAccountNumber(merchant.agencyId, product.code);
      const account = await tx.account.create({
        data: {
          accountNumber,
          clientId: client.id,
          agencyId: merchant.agencyId,
          productId: product.id,
          type: 'CURRENT',
          balance: 0,
        },
      });

      return { client, account, accountNumber };
    });

    const clientName = `${dto.firstName} ${dto.lastName}`;

    // Envoyer identifiants + message de bienvenue via WhatsApp
    const waText =
      `*Bienvenue chez GFSolutions !* 🎉\n\n` +
      `Cher(e) *${clientName}*,\n\n` +
      `Votre compte bancaire GFSolutions a ete cree avec succes via *${merchant.name}*.\n\n` +
      `📱 *Vos identifiants :*\n` +
      `• Numero client : *${clientNumber}*\n` +
      `• Mot de passe : *${rawPassword}*\n` +
      `• Code PIN : *${rawPin}*\n` +
      `• N° de compte : *${result.accountNumber}*\n\n` +
      `📥 *Telechargez l'application GFS* pour gerer votre compte :\n` +
      `Android : https://play.google.com/store/apps/details?id=com.gfsolutions.app\n\n` +
      `⚠️ *IMPORTANT* : Veuillez passer au bureau GFSolutions le plus proche avec les documents suivants :\n` +
      `- Piece d'identite (CNI, Passeport ou Carte de sejour)\n` +
      `- Une photo d'identite recente\n` +
      `- Justificatif de domicile\n\n` +
      `_Changez votre mot de passe et PIN apres votre premiere connexion._\n\n` +
      `*Global Financial Solution* — Votre partenaire financier 🏦`;

    this.whatsappService.sendMessage(phone, waText)
      .catch((e) => this.logger.warn(`[PartnerOnboard] WhatsApp echec: ${e.message}`));

    // Aussi par SMS (version courte)
    const smsText = `GFSolutions: Votre compte ${clientNumber} a ete cree. Mot de passe: ${rawPassword}, PIN: ${rawPin}. Passez au bureau avec votre CNI. Telechargez l'app GFS.`;
    this.smsService.send(phone, smsText)
      .catch((e) => this.logger.warn(`[PartnerOnboard] SMS echec: ${e.message}`));

    // Webhook vers le marchand
    if (merchant.webhookUrl) {
      const payload = {
        event: 'client.onboarded',
        clientNumber,
        accountNumber: result.accountNumber,
        phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        partnerUserId: dto.partnerUserId,
        amountDebited: 0,
        timestamp: new Date().toISOString(),
      };
      const hmac = crypto.createHmac('sha256', merchant.apiKey).update(JSON.stringify(payload)).digest('hex');
      fetch(merchant.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GFS-Signature': `sha256=${hmac}`,
          'X-GFS-Event': 'client.onboarded',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      }).catch((e) => this.logger.warn(`[PartnerOnboard] Webhook echec: ${e.message}`));
    }

    this.logger.log(`[PartnerOnboard] Client cree: ${clientNumber} — ${clientName} — via ${merchant.name}`);

    return {
      success: true,
      alreadyExists: false,
      clientNumber,
      accountNumber: result.accountNumber,
      phone,
      amountDebited: 0,
      message: `Compte GFSolutions cree pour ${clientName}. Identifiants envoyes par WhatsApp et SMS.`,
    };
  }

  // ==================== RAPPELS KYC PARTENAIRES (cron) ====================

  async sendKycReminders() {
    // Trouver les clients crees par partenaires dont le KYC n'est pas verifie
    // et dont le dernier rappel date de plus de 2 jours
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const clients = await this.prisma.client.findMany({
      where: {
        partnerSource: { not: null },
        kycVerified: false,
        status: 'ACTIVE',
        OR: [
          { kycReminderSentAt: null },
          { kycReminderSentAt: { lt: twoDaysAgo } },
        ],
      },
      take: 50,
    });

    let sent = 0;
    for (const client of clients) {
      const name = `${client.firstName || ''} ${client.lastName || ''}`.trim();
      const reminderNum = (client.kycReminderCount || 0) + 1;

      const text =
        `🔔 *Rappel GFSolutions*\n\n` +
        `Cher(e) *${name}*,\n\n` +
        `Votre compte *${client.clientNumber}* a ete cree mais vos documents ne sont pas encore a jour.\n\n` +
        `📋 *Documents requis :*\n` +
        `- Piece d'identite (CNI/Passeport)\n` +
        `- Photo d'identite recente\n` +
        `- Justificatif de domicile\n\n` +
        `Passez au bureau GFSolutions le plus proche pour completer votre dossier.\n\n` +
        `_Rappel n°${reminderNum} — Global Financial Solution_ 🏦`;

      try {
        await this.whatsappService.sendMessage(client.phone, text);
        await this.prisma.client.update({
          where: { id: client.id },
          data: {
            kycReminderSentAt: new Date(),
            kycReminderCount: reminderNum,
          },
        });
        sent++;
      } catch (e) {
        this.logger.warn(`[KycReminder] Echec pour ${client.clientNumber}: ${e.message}`);
      }
    }

    this.logger.log(`[KycReminder] ${sent}/${clients.length} rappels envoyes`);
    return { sent, total: clients.length };
  }

  // ==================== STATS ADMIN ====================

  async getGatewayStats() {
    const [totalMerchants, activeMerchants, totalPayments, completedPayments, totalOnboardedClients] = await Promise.all([
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.paymentRequest.count(),
      this.prisma.paymentRequest.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.client.count({ where: { partnerSource: { not: null } } }),
    ]);

    return {
      totalMerchants,
      activeMerchants,
      totalPayments,
      completedPayments: completedPayments._count.id,
      totalVolumeXAF: Number(completedPayments._sum.amount || 0),
      totalOnboardedClients,
    };
  }
}
