import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { AuditService } from '../audit/audit.service';

interface UssdSession {
  clientId: string;
  verified: boolean;
  phone: string;
  createdAt: number;
}

@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);

  // Cache de sessions avec TTL
  private sessions = new Map<string, UssdSession>();

  // Nettoyage automatique toutes les 5 minutes
  private readonly SESSION_TTL_MS = 5 * 60 * 1000; // 5 min (sessions USSD sont courtes)
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private auditService: AuditService,
  ) {
    this.cleanupInterval = setInterval(() => this.cleanExpiredSessions(), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }

  private cleanExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.SESSION_TTL_MS) {
        this.sessions.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Sessions USSD nettoyees: ${cleaned}`);
    }
  }

  async handleRequest(
    sessionId: string,
    phoneNumber: string,
    text: string,
  ): Promise<string> {
    const parts = text.split('*').filter((p) => p !== '');

    // Etape 0: Menu principal (aucune saisie)
    if (parts.length === 0) {
      return this.mainMenu();
    }

    const choice = parts[0];

    switch (choice) {
      case '1':
        return this.handleSolde(sessionId, phoneNumber, parts);
      case '2':
        return this.handleMiniReleve(sessionId, phoneNumber, parts);
      case '3':
        return this.handleCotisation(sessionId, phoneNumber, parts);
      case '4':
        return this.handleRemboursement(sessionId, phoneNumber, parts);
      default:
        return 'END Option invalide. Reessayez.';
    }
  }

  private mainMenu(): string {
    return [
      'CON Bienvenue chez Global Financial Solution',
      '1. Consulter solde',
      '2. Mini-releve',
      '3. Payer cotisation',
      '4. Rembourser credit',
    ].join('\n');
  }

  // =====================================================
  // AUTHENTIFICATION PIN
  // =====================================================

  private async authenticateByPin(
    sessionId: string,
    phoneNumber: string,
    pin: string,
  ): Promise<{ success: boolean; clientId?: string; error?: string }> {
    // Normaliser le numero (enlever le +)
    const phone = phoneNumber.replace('+', '');
    const phoneVariants = [
      phone,
      `+${phone}`,
      phone.replace('237', ''),
      `+237${phone.replace('237', '')}`,
    ];

    const client = await this.prisma.client.findFirst({
      where: {
        OR: phoneVariants.map((p) => ({ phone: p })),
        status: 'ACTIVE',
      },
    });

    if (!client) {
      this.logger.warn(`USSD auth echouee: numero non reconnu ${phoneNumber}`);
      return { success: false, error: 'Numero non reconnu' };
    }

    if (!client.pin) {
      return {
        success: false,
        error: 'PIN non configure. Rendez-vous en agence.',
      };
    }

    const pinValid = await bcrypt.compare(pin, client.pin);
    if (!pinValid) {
      this.logger.warn(`USSD auth echouee: mauvais PIN pour client ${client.clientNumber}`);
      return { success: false, error: 'PIN incorrect' };
    }

    // Stocker la session
    this.sessions.set(sessionId, {
      clientId: client.id,
      verified: true,
      phone: phoneNumber,
      createdAt: Date.now(),
    });

    return { success: true, clientId: client.id };
  }

  private getSession(sessionId: string): UssdSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session && Date.now() - session.createdAt > this.SESSION_TTL_MS) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  // =====================================================
  // 1. CONSULTER SOLDE
  // =====================================================

  private async handleSolde(
    sessionId: string,
    phoneNumber: string,
    parts: string[],
  ): Promise<string> {
    if (parts.length === 1) {
      return 'CON Entrez votre code PIN:';
    }

    const auth = await this.authenticateByPin(sessionId, phoneNumber, parts[1]);
    if (!auth.success) return `END ${auth.error}`;

    const accounts = await this.prisma.account.findMany({
      where: { clientId: auth.clientId!, status: 'ACTIVE' },
    });

    if (accounts.length === 0) return 'END Aucun compte actif trouve.';

    const lines = ['END Vos soldes:'];
    for (const acc of accounts) {
      const typeLabel = this.getAccountTypeLabel(acc.type);
      lines.push(`${typeLabel}: ${this.formatAmount(Number(acc.balance))} FCFA`);
    }

    // Audit
    await this.logUssdAction(auth.clientId!, 'CONSULTATION_SOLDE', phoneNumber);

    return lines.join('\n');
  }

  // =====================================================
  // 2. MINI-RELEVE
  // =====================================================

  private async handleMiniReleve(
    sessionId: string,
    phoneNumber: string,
    parts: string[],
  ): Promise<string> {
    if (parts.length === 1) {
      return 'CON Entrez votre code PIN:';
    }

    const auth = await this.authenticateByPin(sessionId, phoneNumber, parts[1]);
    if (!auth.success) return `END ${auth.error}`;

    const accounts = await this.prisma.account.findMany({
      where: { clientId: auth.clientId! },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [
          { fromAccountId: { in: accountIds } },
          { toAccountId: { in: accountIds } },
        ],
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (transactions.length === 0) return 'END Aucune transaction recente.';

    const lines = ['END Dernieres operations:'];
    for (const tx of transactions) {
      const date = tx.createdAt.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
      });
      const isDebit = accountIds.includes(tx.fromAccountId || '');
      const sign = isDebit ? '-' : '+';
      const typeLabel = this.getTransactionTypeLabel(tx.type);
      lines.push(`${date} ${typeLabel} ${sign}${this.formatAmount(Number(tx.amount))}F`);
    }

    // Audit
    await this.logUssdAction(auth.clientId!, 'MINI_RELEVE', phoneNumber);

    return lines.join('\n');
  }

  // =====================================================
  // 3. PAYER COTISATION
  // =====================================================

  private async handleCotisation(
    sessionId: string,
    phoneNumber: string,
    parts: string[],
  ): Promise<string> {
    if (parts.length === 1) {
      return 'CON Entrez votre code PIN:';
    }

    const session = this.getSession(sessionId);
    if (!session?.verified) {
      const auth = await this.authenticateByPin(sessionId, phoneNumber, parts[1]);
      if (!auth.success) return `END ${auth.error}`;
    }

    const clientId = this.getSession(sessionId)!.clientId;

    if (parts.length === 2) {
      const memberships = await this.prisma.tontineMember.findMany({
        where: { clientId, isActive: true },
        include: { group: true },
      });

      if (memberships.length === 0) return 'END Aucune cotisation active.';

      const lines = ['CON Vos cotisations:'];
      memberships.forEach((m, i) => {
        const freqLabel =
          m.group.frequency === 'DAILY'
            ? 'jour'
            : m.group.frequency === 'WEEKLY'
              ? 'sem'
              : 'mois';
        lines.push(
          `${i + 1}. ${m.group.name} - ${this.formatAmount(Number(m.group.contributionAmount))}F/${freqLabel}`,
        );
      });
      return lines.join('\n');
    }

    if (parts.length === 3) {
      const idx = parseInt(parts[2]) - 1;
      const memberships = await this.prisma.tontineMember.findMany({
        where: { clientId, isActive: true },
        include: { group: true },
      });
      if (idx < 0 || idx >= memberships.length) return 'END Selection invalide.';

      const group = memberships[idx].group;
      return `CON ${group.name}\nMontant par defaut: ${this.formatAmount(Number(group.contributionAmount))}F\nEntrez le montant a payer:`;
    }

    if (parts.length === 4) {
      const amount = parseInt(parts[3]);
      if (isNaN(amount) || amount <= 0) return 'END Montant invalide.';
      return `CON Confirmer paiement de ${this.formatAmount(amount)} FCFA?\n1. Confirmer\n2. Annuler`;
    }

    if (parts.length === 5 && parts[4] === '1') {
      const idx = parseInt(parts[2]) - 1;
      const amount = parseInt(parts[3]);

      const memberships = await this.prisma.tontineMember.findMany({
        where: { clientId, isActive: true },
        include: { group: true },
      });
      if (idx < 0 || idx >= memberships.length) return 'END Erreur de selection.';

      const account = await this.prisma.account.findFirst({
        where: { clientId, status: 'ACTIVE', type: 'CURRENT' },
      });
      if (!account || Number(account.balance) < amount) {
        return 'END Solde insuffisant.';
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.account.update({
            where: { id: account.id },
            data: { balance: { decrement: amount } },
          });

          const group = memberships[idx].group;
          const currentRound = await tx.tontineRound.findFirst({
            where: { groupId: group.id, roundNumber: group.currentRound },
            orderBy: { roundNumber: 'desc' },
          });

          if (currentRound) {
            await tx.tontinePayment.updateMany({
              where: {
                roundId: currentRound.id,
                memberId: memberships[idx].id,
                isPaid: false,
              },
              data: { isPaid: true, amount, paidAt: new Date() },
            });
          }

          await tx.tontineMember.update({
            where: { id: memberships[idx].id },
            data: { totalPaid: { increment: amount } },
          });
        });

        // SMS de confirmation
        await this.sendConfirmationSms(
          phoneNumber,
          `Cotisation ${memberships[idx].group.name}: ${this.formatAmount(amount)} FCFA paye avec succes. Nouveau solde: ${this.formatAmount(Number(account.balance) - amount)} FCFA. GFS`,
        );

        // Audit
        await this.logUssdAction(clientId, 'PAIEMENT_COTISATION', phoneNumber, {
          groupe: memberships[idx].group.name,
          montant: amount,
        });

        return `END Paiement de ${this.formatAmount(amount)} FCFA effectue avec succes.`;
      } catch (error) {
        this.logger.error(`Erreur cotisation USSD: ${error.message}`);
        return 'END Erreur lors du paiement. Reessayez.';
      }
    }

    return 'END Operation annulee.';
  }

  // =====================================================
  // 4. REMBOURSER CREDIT
  // =====================================================

  private async handleRemboursement(
    sessionId: string,
    phoneNumber: string,
    parts: string[],
  ): Promise<string> {
    if (parts.length === 1) {
      return 'CON Entrez votre code PIN:';
    }

    const session = this.getSession(sessionId);
    if (!session?.verified) {
      const auth = await this.authenticateByPin(sessionId, phoneNumber, parts[1]);
      if (!auth.success) return `END ${auth.error}`;
    }

    const clientId = this.getSession(sessionId)!.clientId;

    if (parts.length === 2) {
      const credits = await this.prisma.credit.findMany({
        where: { clientId, status: { in: ['DISBURSED', 'ACTIVE'] } },
      });

      if (credits.length === 0) return 'END Aucun credit actif.';

      const lines = ['CON Vos credits:'];
      credits.forEach((c, i) => {
        lines.push(
          `${i + 1}. ${c.creditNumber} - Reste: ${this.formatAmount(Number(c.remainingAmount))}F`,
        );
      });
      return lines.join('\n');
    }

    if (parts.length === 3) {
      const idx = parseInt(parts[2]) - 1;
      const credits = await this.prisma.credit.findMany({
        where: { clientId, status: { in: ['DISBURSED', 'ACTIVE'] } },
      });
      if (idx < 0 || idx >= credits.length) return 'END Selection invalide.';

      const credit = credits[idx];
      const nextRepayment = await this.prisma.repayment.findFirst({
        where: {
          creditId: credit.id,
          status: { in: ['PENDING', 'LATE', 'PARTIAL'] },
        },
        orderBy: { dueDate: 'asc' },
      });

      if (!nextRepayment) return 'END Aucune echeance en attente.';

      const due =
        Number(nextRepayment.amount) +
        Number(nextRepayment.penalty) +
        Number(nextRepayment.moratoireAmount) -
        Number(nextRepayment.paidAmount);
      const dueDate = nextRepayment.dueDate.toLocaleDateString('fr-FR');

      return `CON Echeance du ${dueDate}\nMontant: ${this.formatAmount(due)} FCFA\n1. Payer\n2. Annuler`;
    }

    if (parts.length === 4 && parts[3] === '1') {
      const idx = parseInt(parts[2]) - 1;
      const credits = await this.prisma.credit.findMany({
        where: { clientId, status: { in: ['DISBURSED', 'ACTIVE'] } },
      });
      if (idx < 0 || idx >= credits.length) return 'END Erreur.';

      const credit = credits[idx];
      const repayment = await this.prisma.repayment.findFirst({
        where: {
          creditId: credit.id,
          status: { in: ['PENDING', 'LATE', 'PARTIAL'] },
        },
        orderBy: { dueDate: 'asc' },
      });
      if (!repayment) return 'END Aucune echeance.';

      const totalDue =
        Number(repayment.amount) +
        Number(repayment.penalty) +
        Number(repayment.moratoireAmount) -
        Number(repayment.paidAmount);

      const account = await this.prisma.account.findFirst({
        where: { clientId, status: 'ACTIVE', type: 'CURRENT' },
      });
      if (!account || Number(account.balance) < totalDue) {
        return `END Solde insuffisant. Requis: ${this.formatAmount(totalDue)}F`;
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.account.update({
            where: { id: account.id },
            data: { balance: { decrement: totalDue } },
          });
          await tx.credit.update({
            where: { id: credit.id },
            data: { remainingAmount: { decrement: Number(repayment.amount) } },
          });
          await tx.repayment.update({
            where: { id: repayment.id },
            data: {
              paidAmount: { increment: totalDue },
              status: 'PAID',
              paidAt: new Date(),
            },
          });

          const pending = await tx.repayment.count({
            where: { creditId: credit.id, status: { not: 'PAID' } },
          });
          if (pending === 0) {
            await tx.credit.update({
              where: { id: credit.id },
              data: { status: 'COMPLETED' },
            });
          }
        });

        // SMS de confirmation
        await this.sendConfirmationSms(
          phoneNumber,
          `Echeance credit ${credit.creditNumber} payee: ${this.formatAmount(totalDue)} FCFA. Nouveau solde: ${this.formatAmount(Number(account.balance) - totalDue)} FCFA. GFS`,
        );

        // Audit
        await this.logUssdAction(clientId, 'REMBOURSEMENT_CREDIT', phoneNumber, {
          credit: credit.creditNumber,
          montant: totalDue,
        });

        return `END Echeance payee avec succes!\nMontant: ${this.formatAmount(totalDue)} FCFA`;
      } catch (error) {
        this.logger.error(`Erreur remboursement USSD: ${error.message}`);
        return 'END Erreur lors du paiement. Reessayez.';
      }
    }

    return 'END Operation annulee.';
  }

  // =====================================================
  // UTILITAIRES
  // =====================================================

  private formatAmount(amount: number): string {
    return Math.round(amount)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  private getAccountTypeLabel(type: string): string {
    switch (type) {
      case 'CURRENT': return 'Courant';
      case 'SAVINGS': return 'Epargne';
      case 'DAT': return 'DAT';
      default: return type;
    }
  }

  private getTransactionTypeLabel(type: string): string {
    switch (type) {
      case 'DEPOSIT': return 'Depot';
      case 'WITHDRAWAL': return 'Retrait';
      case 'TRANSFER': return 'Virement';
      case 'SALARY_PAYMENT': return 'Salaire';
      case 'FEE': return 'Frais';
      default: return type;
    }
  }

  private async sendConfirmationSms(phone: string, message: string) {
    try {
      await this.smsService.send(phone, message);
    } catch (error) {
      this.logger.error(`Erreur SMS confirmation USSD: ${error.message}`);
    }
  }

  private async logUssdAction(
    clientId: string,
    action: string,
    phone: string,
    details?: Record<string, any>,
  ) {
    try {
      await this.auditService.log({
        userId: clientId,
        action,
        module: 'USSD',
        entityType: 'CLIENT',
        entityId: clientId,
        details: JSON.stringify({ phone, canal: 'USSD', ...details }),
      });
    } catch (error) {
      this.logger.error(`Erreur audit USSD: ${error.message}`);
    }
  }
}
