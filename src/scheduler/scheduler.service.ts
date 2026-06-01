import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../sms/sms.service';
import { CreditsService } from '../credits/credits.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
    private notificationsService: NotificationsService,
    private smsService: SmsService,
    private creditsService: CreditsService,
    private configService: ConfigService,
  ) {}

  // ==================== a) CALCUL INTERETS MENSUELS (par quinzaine) ====================
  // Dernier jour du mois a 23:00

  @Cron('0 23 28-31 * *')
  async calculateMonthlyInterests() {
    const now = new Date();
    // Verifier que c'est bien le dernier jour du mois
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() !== lastDay) {
      return;
    }

    this.logger.log('=== Debut calcul interets mensuels par quinzaine ===');

    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Trouver tous les comptes epargne actifs avec taux d'interet > 0
    const accounts = await this.prisma.savingsAccount.findMany({
      where: {
        status: 'ACTIVE',
        product: { interestRate: { gt: 0 } },
      },
      include: { product: true },
    });

    this.logger.log(`${accounts.length} comptes epargne actifs avec interets`);

    let totalInterestCalculated = 0;

    for (const account of accounts) {
      try {
        const rate = Number(account.product.interestRate) / 100; // taux annuel en decimal

        // Dates de la quinzaine 1 (1-15) et quinzaine 2 (16-fin)
        const startQ1 = new Date(year, month - 1, 1, 0, 0, 0);
        const endQ1 = new Date(year, month - 1, 15, 23, 59, 59);
        const startQ2 = new Date(year, month - 1, 16, 0, 0, 0);
        const endQ2 = new Date(year, month - 1, lastDay, 23, 59, 59);

        // Calculer le solde minimum pendant chaque quinzaine
        const minQ1 = await this.getMinBalance(account.id, Number(account.balance), startQ1, endQ1);
        const minQ2 = await this.getMinBalance(account.id, Number(account.balance), startQ2, endQ2);

        // Calcul : interet = (minQ1 * taux/24) + (minQ2 * taux/24)
        // 24 = 12 mois * 2 quinzaines
        const interest = Math.round((minQ1 * rate / 24) + (minQ2 * rate / 24));

        if (interest > 0) {
          // Mettre a jour le cumul interets (provisionne, pas encore credite)
          await this.prisma.savingsAccount.update({
            where: { id: account.id },
            data: {
              interestEarned: { increment: interest },
            },
          });

          // Creer une ecriture de contribution type INTEREST (provisionnee)
          await this.prisma.savingsContribution.create({
            data: {
              savingsAccountId: account.id,
              type: 'INTEREST',
              amount: interest,
              balanceAfter: Number(account.balance), // Le solde ne change pas encore
              description: `Interets quinzaine ${String(month).padStart(2, '0')}/${year}`,
            },
          });

          totalInterestCalculated += interest;
          this.logger.log(
            `Compte ${account.accountNumber}: minQ1=${minQ1}, minQ2=${minQ2}, taux=${rate * 100}%, interets=${interest} FCFA`,
          );
        }
      } catch (error) {
        this.logger.error(`Erreur calcul interets compte ${account.accountNumber}: ${error.message}`);
      }
    }

    this.logger.log(`=== Fin calcul interets: ${totalInterestCalculated} FCFA total provisionne ===`);
  }

  /**
   * Calcule le solde minimum d'un compte epargne pendant une periode
   * en reconstituant les soldes a partir des contributions
   */
  private async getMinBalance(
    savingsAccountId: string,
    currentBalance: number,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // Recuperer toutes les contributions de la periode
    const contributions = await this.prisma.savingsContribution.findMany({
      where: {
        savingsAccountId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (contributions.length === 0) {
      // Pas de mouvement : le solde est reste constant
      // On prend le balanceAfter de la derniere contribution avant la periode
      const lastBefore = await this.prisma.savingsContribution.findFirst({
        where: {
          savingsAccountId,
          createdAt: { lt: startDate },
        },
        orderBy: { createdAt: 'desc' },
      });
      return lastBefore ? Number(lastBefore.balanceAfter) : currentBalance;
    }

    // Reconstituer les soldes et trouver le minimum
    let minBalance = Number(contributions[0].balanceAfter);
    for (const contrib of contributions) {
      const bal = Number(contrib.balanceAfter);
      if (bal < minBalance) {
        minBalance = bal;
      }
    }

    // Verifier aussi le solde juste avant la premiere contribution de la periode
    const firstContrib = contributions[0];
    const amount = Number(firstContrib.amount);
    const balBefore = firstContrib.type === 'WITHDRAWAL'
      ? Number(firstContrib.balanceAfter) + amount
      : Number(firstContrib.balanceAfter) - amount;

    if (balBefore < minBalance) {
      minBalance = balBefore;
    }

    return Math.max(0, minBalance);
  }

  // ==================== b) CAPITALISATION ANNUELLE DES INTERETS ====================
  // 31 decembre a 23:30

  @Cron('30 23 31 12 *')
  async capitalizeAnnualInterests() {
    this.logger.log('=== Debut capitalisation annuelle des interets ===');

    const year = new Date().getFullYear();

    const accounts = await this.prisma.savingsAccount.findMany({
      where: {
        status: 'ACTIVE',
        interestEarned: { gt: 0 },
      },
      include: { product: true },
    });

    this.logger.log(`${accounts.length} comptes avec interets a capitaliser`);

    let totalCapitalized = 0;

    for (const account of accounts) {
      try {
        const interestEarned = Number(account.interestEarned);
        const newBalance = Number(account.balance) + interestEarned;

        // Crediter les interets au solde
        await this.prisma.savingsAccount.update({
          where: { id: account.id },
          data: {
            balance: newBalance,
            interestEarned: 0, // Remettre a zero apres capitalisation
          },
        });

        // Creer la contribution de capitalisation
        await this.prisma.savingsContribution.create({
          data: {
            savingsAccountId: account.id,
            type: 'INTEREST',
            amount: interestEarned,
            balanceAfter: newBalance,
            description: `Capitalisation annuelle interets ${year}`,
          },
        });

        // Ecriture comptable : Debit 601 (Interets sur depots) / Credit 222 (Comptes epargne)
        await this.accountingService.createEntry({
          date: new Date(),
          debitAccountCode: '601',
          creditAccountCode: '222',
          amount: interestEarned,
          label: `Capitalisation interets epargne ${year} - ${account.accountNumber}`,
          reference: `CAP-${year}-${account.accountNumber}`,
          sourceModule: 'SAVINGS',
          sourceId: account.id,
          agencyId: account.agencyId,
        }).catch((e) => this.logger.error(`Erreur ecriture comptable: ${e.message}`));

        totalCapitalized += interestEarned;
        this.logger.log(`Compte ${account.accountNumber}: ${interestEarned} FCFA capitalise`);
      } catch (error) {
        this.logger.error(`Erreur capitalisation compte ${account.accountNumber}: ${error.message}`);
      }
    }

    this.logger.log(`=== Fin capitalisation: ${totalCapitalized} FCFA total capitalise ===`);
  }

  // ==================== c) PRELEVEMENT FRAIS DE TENUE DE COMPTE ====================
  // 1er de chaque mois a 2:00

  @Cron('0 2 1 * *')
  async deductMaintenanceFees() {
    this.logger.log('=== Debut prelevement frais de tenue de compte ===');

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Trouver tous les comptes actifs avec frais de tenue > 0
    const accounts = await this.prisma.account.findMany({
      where: {
        status: 'ACTIVE',
        product: {
          maintenanceFees: { gt: 0 },
        },
      },
      include: { product: true, client: true, agency: true },
    });

    let totalDeducted = 0;
    let skippedCount = 0;

    for (const account of accounts) {
      if (!account.product) continue;

      const fees = Number(account.product.maintenanceFees);
      const frequency = account.product.maintenanceFrequency;

      // Verifier la frequence
      if (frequency === 'QUARTERLY' && ![1, 4, 7, 10].includes(currentMonth)) {
        continue;
      }
      if (frequency === 'YEARLY' && currentMonth !== 1) {
        continue;
      }
      // MONTHLY : toujours executer

      try {
        const balance = Number(account.balance);

        if (balance >= fees) {
          const newBalance = balance - fees;

          // Deduire les frais du solde
          await this.prisma.account.update({
            where: { id: account.id },
            data: { balance: newBalance },
          });

          // Creer une transaction de type FEE
          const reference = `FEE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Date.now().toString().slice(-8)}`;

          await this.prisma.transaction.create({
            data: {
              reference,
              type: 'FEE',
              amount: fees,
              fromAccountId: account.id,
              agencyId: account.agencyId,
              status: 'COMPLETED',
              description: `Frais de tenue de compte ${frequency || 'MONTHLY'} - ${account.accountNumber}`,
            },
          });

          // Ecriture comptable : Debit 222 (Comptes epargne) / Credit 702 (Commissions)
          await this.accountingService.createEntry({
            date: now,
            debitAccountCode: '222',
            creditAccountCode: '702',
            amount: fees,
            label: `Frais tenue compte - ${account.accountNumber}`,
            reference,
            sourceModule: 'TRANSACTION',
            sourceId: account.id,
            agencyId: account.agencyId,
          }).catch((e) => this.logger.error(`Erreur ecriture comptable: ${e.message}`));

          totalDeducted += fees;
          this.logger.log(`Compte ${account.accountNumber}: ${fees} FCFA preleve`);
        } else {
          skippedCount++;
          this.logger.warn(
            `Compte ${account.accountNumber}: solde insuffisant (${balance} FCFA < ${fees} FCFA frais). Prelevement saute.`,
          );
        }
      } catch (error) {
        this.logger.error(`Erreur prelevement frais compte ${account.accountNumber}: ${error.message}`);
      }
    }

    this.logger.log(
      `=== Fin prelevement frais: ${totalDeducted} FCFA total preleve, ${skippedCount} comptes sautes ===`,
    );
  }

  // ==================== d) RAPPELS DE COTISATION ====================
  // Tous les jours a 8:00

  @Cron('0 8 * * *')
  async sendContributionReminders() {
    this.logger.log('=== Debut envoi rappels de cotisation ===');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    // 1. Comptes dont la cotisation est due aujourd'hui ou en retard
    const dueAccounts = await this.prisma.savingsAccount.findMany({
      where: {
        status: 'ACTIVE',
        nextContributionDate: { lte: tomorrow }, // <= aujourd'hui (fin de journee)
        product: { contributionAmount: { gt: 0 } },
      },
      include: { client: true, product: true },
    });

    let sentCount = 0;

    for (const account of dueAccounts) {
      try {
        const contributionAmount = Number(account.product.contributionAmount);
        const message = `Rappel: votre cotisation de ${contributionAmount.toLocaleString('fr-FR')} FCFA pour le compte ${account.accountNumber} est due. Veuillez effectuer votre versement.`;

        // Envoyer SMS
        await this.smsService.send(account.client.phone, message);

        // Creer notification
        await this.notificationsService.create({
          targetType: 'CLIENT',
          targetId: account.clientId,
          title: 'Rappel de cotisation',
          message,
          channel: 'SMS',
        });

        sentCount++;
      } catch (error) {
        this.logger.error(`Erreur rappel compte ${account.accountNumber}: ${error.message}`);
      }
    }

    // 2. Comptes dont la cotisation est demain (pre-rappel)
    const tomorrowAccounts = await this.prisma.savingsAccount.findMany({
      where: {
        status: 'ACTIVE',
        nextContributionDate: {
          gte: tomorrow,
          lt: dayAfterTomorrow,
        },
        product: { contributionAmount: { gt: 0 } },
      },
      include: { client: true, product: true },
    });

    let preReminderCount = 0;

    for (const account of tomorrowAccounts) {
      try {
        const contributionAmount = Number(account.product.contributionAmount);

        await this.notificationsService.create({
          targetType: 'CLIENT',
          targetId: account.clientId,
          title: 'Cotisation demain',
          message: `Votre cotisation de ${contributionAmount.toLocaleString('fr-FR')} FCFA pour le compte ${account.accountNumber} est prevue demain.`,
          channel: 'SYSTEM',
        });

        preReminderCount++;
      } catch (error) {
        this.logger.error(`Erreur pre-rappel compte ${account.accountNumber}: ${error.message}`);
      }
    }

    this.logger.log(
      `=== Fin rappels: ${sentCount} rappels SMS envoyes, ${preReminderCount} pre-rappels crees ===`,
    );
  }

  // ==================== e) PENALITES DE RETARD DE COTISATION ====================
  // Tous les jours a 9:00

  @Cron('0 9 * * *')
  async applyLateContributionPenalties() {
    this.logger.log('=== Debut application penalites de retard ===');

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Comptes en retard de plus de 7 jours
    const overdueAccounts = await this.prisma.savingsAccount.findMany({
      where: {
        status: 'ACTIVE',
        nextContributionDate: { lt: sevenDaysAgo },
        product: {
          contributionAmount: { gt: 0 },
        },
      },
      include: { client: true, product: true },
    });

    let penaltyCount = 0;
    let totalPenalties = 0;

    for (const account of overdueAccounts) {
      try {
        const contributionAmount = Number(account.product.contributionAmount);
        const penalty = Math.round(contributionAmount * 0.05); // 5% de penalite
        const balance = Number(account.balance);

        if (balance >= penalty && penalty > 0) {
          const newBalance = balance - penalty;

          // Deduire la penalite du solde
          await this.prisma.savingsAccount.update({
            where: { id: account.id },
            data: { balance: newBalance },
          });

          // Creer une contribution de type FEE
          await this.prisma.savingsContribution.create({
            data: {
              savingsAccountId: account.id,
              type: 'FEE',
              amount: penalty,
              balanceAfter: newBalance,
              description: `Penalite retard cotisation - 5% de ${contributionAmount} FCFA`,
            },
          });

          penaltyCount++;
          totalPenalties += penalty;

          this.logger.log(
            `Compte ${account.accountNumber}: penalite de ${penalty} FCFA appliquee`,
          );
        }

        // Creer notification dans tous les cas (meme si solde insuffisant)
        await this.notificationsService.create({
          targetType: 'CLIENT',
          targetId: account.clientId,
          title: 'Penalite de retard',
          message: balance >= penalty
            ? `Une penalite de ${penalty.toLocaleString('fr-FR')} FCFA a ete prelevee sur votre compte ${account.accountNumber} pour retard de cotisation.`
            : `Attention: votre cotisation sur le compte ${account.accountNumber} est en retard de plus de 7 jours. Une penalite de ${penalty.toLocaleString('fr-FR')} FCFA sera appliquee des que votre solde le permettra.`,
          channel: 'SYSTEM',
        }).catch((e) => this.logger.error(`Erreur notification: ${e.message}`));
      } catch (error) {
        this.logger.error(`Erreur penalite compte ${account.accountNumber}: ${error.message}`);
      }
    }

    this.logger.log(
      `=== Fin penalites: ${penaltyCount} penalites appliquees, ${totalPenalties} FCFA total ===`,
    );
  }

  // ==================== f) CALCUL MORATOIRES QUOTIDIEN ====================
  // Tous les jours a 01:00

  @Cron('0 1 * * *')
  async calculateDailyMoratoires() {
    this.logger.log('CRON: Calcul des interets moratoires...');
    try {
      const result = await this.creditsService.calculateMoratoires();
      this.logger.log(`Moratoires: ${result.updated} echeance(s) mises a jour sur ${result.processed}`);
    } catch (error) {
      this.logger.error('Erreur calcul moratoires:', error.message);
    }
  }

  // ==================== g) RELANCES SMS CREDITS EN RETARD ====================
  // Tous les jours a 09:00

  @Cron('0 9 * * *')
  async sendCreditRecoveryReminders() {
    this.logger.log('CRON: Envoi des relances credits en retard...');
    try {
      const now = new Date();

      // Trouver toutes les echeances en retard non payees
      const overdueRepayments = await this.prisma.repayment.findMany({
        where: {
          status: 'PENDING',
          dueDate: { lt: now },
        },
        include: {
          credit: {
            include: {
              client: { select: { id: true, firstName: true, lastName: true, phone: true } },
            },
          },
        },
      });

      let sentCount = 0;

      for (const repayment of overdueRepayments) {
        const client = repayment.credit.client;
        if (!client.phone) continue;

        const daysLate = Math.floor((now.getTime() - repayment.dueDate.getTime()) / (24 * 3600 * 1000));
        const amount = Number(repayment.amount);
        const moratoire = Number(repayment.moratoireAmount || 0);
        const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim();
        const formatAmount = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

        let message = '';

        // J+1 : rappel courtois
        if (daysLate === 1) {
          message = `Cher(e) ${clientName}, votre echeance de ${formatAmount(amount)} FCFA etait due hier. Merci de proceder au paiement dans les meilleurs delais. MicroFinance.`;
        }
        // J+7 : rappel ferme
        else if (daysLate === 7) {
          message = `URGENT: ${clientName}, votre echeance de ${formatAmount(amount)} FCFA est en retard de 7 jours. Des interets moratoires s'appliquent. Veuillez regulariser votre situation. MicroFinance.`;
        }
        // J+15 : mise en demeure
        else if (daysLate === 15) {
          message = `MISE EN DEMEURE: ${clientName}, retard de 15 jours sur votre echeance de ${formatAmount(amount)} FCFA. Moratoires accumules: ${formatAmount(moratoire)} FCFA. Total du: ${formatAmount(amount + moratoire)} FCFA. MicroFinance.`;
        }
        // J+30 : avertissement contentieux
        else if (daysLate === 30) {
          message = `AVERTISSEMENT CONTENTIEUX: ${clientName}, votre echeance de ${formatAmount(amount)} FCFA est impayee depuis 30 jours. Votre dossier sera transmis au service contentieux sans regularisation sous 48h. MicroFinance.`;
        }

        if (message) {
          await this.smsService.send(client.phone, message);

          // Notification in-app aussi
          await this.notificationsService.create({
            targetType: 'CLIENT',
            targetId: client.id,
            title: daysLate >= 30 ? 'Avertissement contentieux' : daysLate >= 15 ? 'Mise en demeure' : 'Rappel echeance',
            message: message,
          }).catch(e => this.logger.error('[NOTIF]', e.message));

          sentCount++;
        }
      }

      this.logger.log(`Relances credits: ${sentCount} SMS envoye(s) sur ${overdueRepayments.length} echeance(s) en retard`);
    } catch (error) {
      this.logger.error('Erreur relances credits:', error.message);
    }
  }

  // ==================== h) SAUVEGARDE AUTOMATIQUE QUOTIDIENNE ====================
  // Tous les jours a 3h du matin

  @Cron('0 3 * * *')
  async dailyDatabaseBackup() {
    this.logger.log('=== Debut sauvegarde automatique de la base de donnees ===');

    try {
      const backupDir = path.resolve('./backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const fileName = `backup_${timestamp}.sql`;
      const filePath = path.join(backupDir, fileName);

      const dbHost = this.configService.get<string>('DB_HOST', 'localhost');
      const dbUser = this.configService.get<string>('DB_USER', 'root');
      const dbPassword = this.configService.get<string>('DB_PASSWORD', '');
      const dbName = this.configService.get<string>('DB_NAME', 'microfinance_db');

      const passwordArg = dbPassword ? `-p${dbPassword}` : '';
      const command = `mysqldump -h ${dbHost} -u ${dbUser} ${passwordArg} ${dbName} > ${filePath}`;

      execSync(command, { stdio: 'pipe' });

      this.logger.log(`Sauvegarde creee: ${fileName}`);

      // Supprimer les sauvegardes de plus de 30 jours
      const files = fs.readdirSync(backupDir);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        if (!file.startsWith('backup_') || !file.endsWith('.sql')) continue;
        const fullPath = path.join(backupDir, file);
        const stats = fs.statSync(fullPath);
        if (stats.mtime < thirtyDaysAgo) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        this.logger.log(`${deletedCount} ancienne(s) sauvegarde(s) supprimee(s)`);
      }

      this.logger.log('=== Fin sauvegarde automatique ===');
    } catch (error) {
      this.logger.error(`Erreur sauvegarde base de donnees: ${error.message}`);
    }
  }
}
