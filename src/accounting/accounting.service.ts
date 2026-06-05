import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAccountPlanDto, UpdateAccountPlanDto } from './dto/accounting.dto';

@Injectable()
export class AccountingService implements OnModuleInit {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.prisma.accountPlan.count();
      if (count === 0) {
        this.logger.log('Plan comptable vide — initialisation automatique...');
        await this.seedAccountPlan();
        this.logger.log('Plan comptable EMF initialise avec succes');
      }
    } catch (e) {
      this.logger.warn('Impossible d\'initialiser le plan comptable : ' + e.message);
    }
  }

  // ==================== PLAN COMPTABLE EMF SYSCOHADA ====================

  async seedAccountPlan() {
    const accounts = [
      // Classe 1 - Comptes de tresorerie et operations avec les IF
      { code: '1', name: 'Tresorerie et operations avec les IF', type: 'ACTIF', level: 1 },
      { code: '10', name: 'Caisse', type: 'ACTIF', level: 2, parentCode: '1' },
      { code: '101', name: 'Caisse siege', type: 'ACTIF', level: 3, parentCode: '10' },
      { code: '102', name: 'Caisse agences', type: 'ACTIF', level: 3, parentCode: '10' },
      { code: '11', name: 'Banques et CCP', type: 'ACTIF', level: 2, parentCode: '1' },
      { code: '111', name: 'Comptes bancaires', type: 'ACTIF', level: 3, parentCode: '11' },
      { code: '12', name: 'Comptes de liaison', type: 'ACTIF', level: 2, parentCode: '1' },

      // Classe 2 - Operations avec la clientele
      { code: '2', name: 'Operations avec la clientele', type: 'ACTIF', level: 1 },
      { code: '20', name: 'Credits a la clientele', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '201', name: 'Credits a court terme', type: 'ACTIF', level: 3, parentCode: '20' },
      { code: '202', name: 'Credits a moyen terme', type: 'ACTIF', level: 3, parentCode: '20' },
      { code: '203', name: 'Credits a long terme', type: 'ACTIF', level: 3, parentCode: '20' },
      { code: '21', name: 'Creances en souffrance', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '22', name: 'Depots de la clientele', type: 'PASSIF', level: 2, parentCode: '2' },
      { code: '221', name: 'Comptes courants', type: 'PASSIF', level: 3, parentCode: '22' },
      { code: '222', name: 'Comptes d\'epargne', type: 'PASSIF', level: 3, parentCode: '22' },
      { code: '223', name: 'Depots a terme (DAT)', type: 'PASSIF', level: 3, parentCode: '22' },
      { code: '23', name: 'Provisions pour creances', type: 'PASSIF', level: 2, parentCode: '2' },

      // Classe 3 - Immobilisations
      { code: '3', name: 'Immobilisations', type: 'ACTIF', level: 1 },
      { code: '31', name: 'Immobilisations incorporelles', type: 'ACTIF', level: 2, parentCode: '3' },
      { code: '32', name: 'Immobilisations corporelles', type: 'ACTIF', level: 2, parentCode: '3' },
      { code: '33', name: 'Amortissements', type: 'ACTIF', level: 2, parentCode: '3' },

      // Classe 4 - Capitaux permanents et divers
      { code: '4', name: 'Capitaux permanents et divers', type: 'PASSIF', level: 1 },
      { code: '40', name: 'Capital social', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '41', name: 'Reserves', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '42', name: 'Report a nouveau', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '43', name: 'Resultat de l\'exercice', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '44', name: 'Fournisseurs et dettes', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '45', name: 'Etat et organismes', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '451', name: 'TVA collectee', type: 'PASSIF', level: 3, parentCode: '45' },
      { code: '452', name: 'TVA deductible', type: 'ACTIF', level: 3, parentCode: '45' },

      // Classe 6 - Charges
      { code: '6', name: 'Charges', type: 'CHARGE', level: 1 },
      { code: '60', name: 'Charges d\'exploitation bancaire', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '601', name: 'Interets sur depots', type: 'CHARGE', level: 3, parentCode: '60' },
      { code: '61', name: 'Charges generales', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '62', name: 'Charges de personnel', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '63', name: 'Dotations amortissements', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '64', name: 'Dotations aux provisions', type: 'CHARGE', level: 2, parentCode: '6' },

      // Classe 7 - Produits
      { code: '7', name: 'Produits', type: 'PRODUIT', level: 1 },
      { code: '70', name: 'Produits d\'exploitation bancaire', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '701', name: 'Interets sur credits', type: 'PRODUIT', level: 3, parentCode: '70' },
      { code: '702', name: 'Commissions et frais', type: 'PRODUIT', level: 3, parentCode: '70' },
      { code: '703', name: 'Penalites de retard', type: 'PRODUIT', level: 3, parentCode: '70' },
      { code: '71', name: 'Produits divers', type: 'PRODUIT', level: 2, parentCode: '7' },
    ];

    let created = 0;
    for (const acc of accounts) {
      await this.prisma.accountPlan.upsert({
        where: { code: acc.code },
        update: {},
        create: acc,
      });
      created++;
    }
    return { message: `${created} comptes du plan comptable EMF crees` };
  }

  async getAccountPlan() {
    return this.prisma.accountPlan.findMany({ orderBy: { code: 'asc' } });
  }

  async createAccountPlanEntry(dto: { code: string; name: string; type: string; level: number; parentCode?: string }) {
    // Verifier que le code n'existe pas deja
    const existing = await this.prisma.accountPlan.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException(`Le code comptable ${dto.code} existe deja`);
    }

    // Verifier le parent si specifie
    if (dto.parentCode) {
      const parent = await this.prisma.accountPlan.findUnique({ where: { code: dto.parentCode } });
      if (!parent) {
        throw new BadRequestException(`Compte parent ${dto.parentCode} non trouve`);
      }
    }

    return this.prisma.accountPlan.create({ data: dto });
  }

  async updateAccountPlanEntry(code: string, dto: { name?: string; type?: string; parentCode?: string }) {
    const account = await this.prisma.accountPlan.findUnique({ where: { code } });
    if (!account) throw new NotFoundException(`Compte ${code} non trouve`);

    return this.prisma.accountPlan.update({
      where: { code },
      data: dto,
    });
  }

  async deleteAccountPlanEntry(code: string) {
    const account = await this.prisma.accountPlan.findUnique({ where: { code } });
    if (!account) throw new NotFoundException(`Compte ${code} non trouve`);

    // Verifier qu'aucune ecriture n'est liee a ce compte
    const entriesCount = await this.prisma.journalEntry.count({ where: { accountId: account.id } });
    if (entriesCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${entriesCount} ecriture(s) comptable(s) liee(s) a ce compte`
      );
    }

    // Verifier qu'aucun sous-compte n'existe
    const children = await this.prisma.accountPlan.count({ where: { parentCode: code } });
    if (children > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${children} sous-compte(s) rattache(s)`
      );
    }

    await this.prisma.accountPlan.delete({ where: { code } });
    return { message: `Compte ${code} supprime` };
  }

  // ==================== ECRITURES COMPTABLES ====================

  private async generateEntryNumber() {
    const today = new Date();
    const prefix = `EC-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.prisma.journalEntry.count({
      where: { entryNumber: { startsWith: prefix } },
    });
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * Creer une ecriture comptable en partie double
   */
  async createEntry(data: {
    date: Date;
    debitAccountCode: string;
    creditAccountCode: string;
    amount: number;
    label: string;
    reference?: string;
    sourceModule?: string;
    sourceId?: string;
    agencyId: string;
  }, userId?: string) {
    const debitAccount = await this.prisma.accountPlan.findUnique({ where: { code: data.debitAccountCode } });
    const creditAccount = await this.prisma.accountPlan.findUnique({ where: { code: data.creditAccountCode } });

    if (!debitAccount || !creditAccount) {
      throw new NotFoundException(`Compte comptable non trouve: ${!debitAccount ? data.debitAccountCode : data.creditAccountCode}`);
    }

    // Trouver la periode ouverte
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { status: 'OPEN', startDate: { lte: data.date }, endDate: { gte: data.date } },
    });

    const entryNumber = await this.generateEntryNumber();

    // Partie double : 2 lignes
    const entries = await this.prisma.$transaction([
      this.prisma.journalEntry.create({
        data: {
          entryNumber: `${entryNumber}-D`,
          date: data.date,
          accountId: debitAccount.id,
          debit: data.amount,
          credit: 0,
          label: data.label,
          reference: data.reference,
          sourceModule: data.sourceModule,
          sourceId: data.sourceId,
          agencyId: data.agencyId,
          periodId: period?.id,
        },
      }),
      this.prisma.journalEntry.create({
        data: {
          entryNumber: `${entryNumber}-C`,
          date: data.date,
          accountId: creditAccount.id,
          debit: 0,
          credit: data.amount,
          label: data.label,
          reference: data.reference,
          sourceModule: data.sourceModule,
          sourceId: data.sourceId,
          agencyId: data.agencyId,
          periodId: period?.id,
        },
      }),
    ]);

    await this.auditService.log({
      userId: userId || 'SYSTEM',
      action: 'CREATE_ENTRY',
      module: 'ACCOUNTING',
      entityId: entries[0]?.id,
      entityType: 'JournalEntry',
      details: `Ecriture ${entryNumber}: D:${data.debitAccountCode} C:${data.creditAccountCode} ${data.amount} FCFA - ${data.label}`,
      newValues: { debitAccountCode: data.debitAccountCode, creditAccountCode: data.creditAccountCode, amount: data.amount, reference: data.reference },
    }).catch(() => {});

    return entries;
  }

  /**
   * Ecriture auto pour un depot client
   * Debit: 101 Caisse (ou 111 Banque si Mobile Money) | Credit: 221 Comptes courants
   * + Debit: 221 Comptes courants (frais) | Credit: 702 Commissions
   * + Debit: 702 -> Credit: 451 TVA
   */
  async recordDeposit(agencyId: string, amount: number, fees: number, tax: number, reference: string, isMobileMoney: boolean) {
    const debitCode = isMobileMoney ? '111' : '101';
    const entries: any[] = [];

    // Depot principal
    entries.push(await this.createEntry({
      date: new Date(), debitAccountCode: debitCode, creditAccountCode: '221',
      amount, label: `Depot client - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
    }));

    // Frais
    if (fees > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '221', creditAccountCode: '702',
        amount: fees, label: `Frais depot - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
      }));
    }

    // TVA sur frais
    if (tax > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '702', creditAccountCode: '451',
        amount: tax, label: `TVA sur frais - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
      }));
    }

    return entries;
  }

  /**
   * Ecriture auto pour un retrait client
   * Debit: 221 Comptes courants | Credit: 101 Caisse
   */
  async recordWithdrawal(agencyId: string, amount: number, fees: number, tax: number, reference: string, isMobileMoney: boolean) {
    const creditCode = isMobileMoney ? '111' : '101';
    const entries: any[] = [];

    entries.push(await this.createEntry({
      date: new Date(), debitAccountCode: '221', creditAccountCode: creditCode,
      amount, label: `Retrait client - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
    }));

    if (fees > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '221', creditAccountCode: '702',
        amount: fees, label: `Frais retrait - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
      }));
    }

    if (tax > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '702', creditAccountCode: '451',
        amount: tax, label: `TVA sur frais - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
      }));
    }

    return entries;
  }

  /**
   * Ecriture auto pour decaissement credit
   * Debit: 201/202/203 Credits | Credit: 221 Comptes courants
   */
  async recordCreditDisbursement(agencyId: string, amount: number, durationMonths: number, reference: string) {
    const accountCode = durationMonths <= 12 ? '201' : durationMonths <= 36 ? '202' : '203';
    return this.createEntry({
      date: new Date(), debitAccountCode: accountCode, creditAccountCode: '221',
      amount, label: `Decaissement credit - ${reference}`, reference, sourceModule: 'CREDIT', agencyId,
    });
  }

  /**
   * Ecriture auto pour remboursement credit
   * Debit: 221 Comptes courants | Credit: 201 Credits (capital)
   * Debit: 221 Comptes courants | Credit: 701 Interets sur credits
   */
  async recordCreditRepayment(agencyId: string, principal: number, interest: number, reference: string) {
    const entries: any[] = [];
    if (principal > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '221', creditAccountCode: '201',
        amount: principal, label: `Remboursement capital - ${reference}`, reference, sourceModule: 'CREDIT', agencyId,
      }));
    }
    if (interest > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '221', creditAccountCode: '701',
        amount: interest, label: `Interets credit - ${reference}`, reference, sourceModule: 'CREDIT', agencyId,
      }));
    }
    return entries;
  }

  // ==================== GRAND LIVRE ====================

  async getGrandLivre(code: string, params: { startDate?: string; endDate?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 50, startDate, endDate } = params;

    const account = await this.prisma.accountPlan.findUnique({ where: { code } });
    if (!account) throw new NotFoundException(`Compte ${code} non trouve dans le plan comptable`);

    const where: any = { accountId: account.id };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); where.date.lte = d; }
    }

    const [entries, total, sums] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
      this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where,
      }),
    ]);

    const totalDebit = Number(sums._sum.debit || 0);
    const totalCredit = Number(sums._sum.credit || 0);

    return {
      compte: { code: account.code, name: account.name, type: account.type },
      totalDebit,
      totalCredit,
      solde: totalDebit - totalCredit,
      entries,
      total,
      page,
      limit,
    };
  }

  // ==================== JOURNAL & RAPPORTS ====================

  async getJournal(params: { page?: number; limit?: number; startDate?: string; endDate?: string; accountCode?: string; agencyId?: string }) {
    const { page = 1, limit = 50, startDate, endDate, accountCode, agencyId } = params;
    const where: any = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (accountCode) {
      const acc = await this.prisma.accountPlan.findUnique({ where: { code: accountCode } });
      if (acc) where.accountId = acc.id;
    }
    if (agencyId) where.agencyId = agencyId;

    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: { account: { select: { code: true, name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ==================== JOURNAUX AUXILIAIRES ====================

  /**
   * Journaux auxiliaires SYSCOHADA EMF
   * CAISSE : ecritures impliquant comptes 101, 102
   * BANQUE : ecritures impliquant compte 111
   * OD : toutes les autres ecritures (operations diverses)
   */
  async getJournalAuxiliaire(params: {
    type: 'CAISSE' | 'BANQUE' | 'OD';
    page?: number; limit?: number;
    startDate?: string; endDate?: string;
  }) {
    const { type, page = 1, limit = 50, startDate, endDate } = params;

    // Trouver les IDs des comptes caisse et banque
    const caisseAccounts = await this.prisma.accountPlan.findMany({
      where: { code: { in: ['101', '102'] } },
    });
    const banqueAccounts = await this.prisma.accountPlan.findMany({
      where: { code: { in: ['111'] } },
    });

    const caisseIds = caisseAccounts.map(a => a.id);
    const banqueIds = banqueAccounts.map(a => a.id);

    const where: any = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); where.date.lte = d; }
    }

    // Filtrer par type de journal
    // On recupere les entryNumbers qui contiennent des lignes sur les comptes cibles
    if (type === 'CAISSE') {
      where.accountId = { in: caisseIds };
    } else if (type === 'BANQUE') {
      where.accountId = { in: banqueIds };
    } else {
      // OD : ni caisse ni banque
      where.accountId = { notIn: [...caisseIds, ...banqueIds] };
    }

    const [entries, total, sums] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: { account: { select: { code: true, name: true } } },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
      this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where,
      }),
    ]);

    return {
      type,
      data: entries,
      total,
      page,
      limit,
      totalDebit: Number(sums._sum.debit || 0),
      totalCredit: Number(sums._sum.credit || 0),
    };
  }

  /**
   * Balance des comptes (solde debit - credit par compte)
   */
  async getBalance(startDate?: string, endDate?: string) {
    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const accounts = await this.prisma.accountPlan.findMany({
      where: { level: { gte: 2 } },
      orderBy: { code: 'asc' },
    });

    const balances: any[] = [];
    for (const acc of accounts) {
      const result = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { ...where, accountId: acc.id },
      });

      const totalDebit = Number(result._sum.debit || 0);
      const totalCredit = Number(result._sum.credit || 0);
      const solde = totalDebit - totalCredit;

      if (totalDebit > 0 || totalCredit > 0) {
        balances.push({
          code: acc.code,
          name: acc.name,
          type: acc.type,
          totalDebit,
          totalCredit,
          soldeDebiteur: solde > 0 ? solde : 0,
          soldeCrediteur: solde < 0 ? Math.abs(solde) : 0,
        });
      }
    }

    return balances;
  }

  // ==================== BILAN (Balance Sheet) ====================

  /**
   * Bilan SYSCOHADA EMF
   * ACTIF : comptes de type ACTIF (classes 1, 2 partiel, 3)
   * PASSIF : comptes de type PASSIF (classe 2 partiel, 4) + Resultat
   */
  async getBilan(startDate?: string, endDate?: string) {
    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); where.date.lte = d; }
    }

    const accounts = await this.prisma.accountPlan.findMany({
      where: { level: { gte: 2 } },
      orderBy: { code: 'asc' },
    });

    const actif: any[] = [];
    const passif: any[] = [];
    let totalActif = 0;
    let totalPassif = 0;

    for (const acc of accounts) {
      const result = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { ...where, accountId: acc.id },
      });

      const totalDebit = Number(result._sum.debit || 0);
      const totalCredit = Number(result._sum.credit || 0);
      if (totalDebit === 0 && totalCredit === 0) continue;

      const solde = totalDebit - totalCredit;
      const entry = { code: acc.code, name: acc.name, type: acc.type, solde: Math.abs(solde) };

      if (acc.type === 'ACTIF') {
        // Actif: solde debiteur normal (debit - credit)
        const val = solde > 0 ? solde : 0;
        actif.push({ ...entry, solde: val });
        totalActif += val;
      } else if (acc.type === 'PASSIF') {
        // Passif: solde crediteur normal (credit - debit)
        const val = solde < 0 ? Math.abs(solde) : 0;
        passif.push({ ...entry, solde: val });
        totalPassif += val;
      }
    }

    // Calculer le resultat de l'exercice (Produits - Charges)
    const charges = accounts.filter(a => a.type === 'CHARGE');
    const produits = accounts.filter(a => a.type === 'PRODUIT');

    let totalCharges = 0;
    let totalProduits = 0;

    for (const acc of charges) {
      const r = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { ...where, accountId: acc.id },
      });
      totalCharges += Number(r._sum.debit || 0) - Number(r._sum.credit || 0);
    }
    for (const acc of produits) {
      const r = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { ...where, accountId: acc.id },
      });
      totalProduits += Number(r._sum.credit || 0) - Number(r._sum.debit || 0);
    }

    const resultat = totalProduits - totalCharges;

    // Ajouter le resultat au passif
    if (resultat !== 0) {
      passif.push({
        code: '43', name: 'Resultat de l\'exercice', type: 'PASSIF',
        solde: resultat,
      });
      totalPassif += resultat;
    }

    return { actif, passif, totalActif, totalPassif, resultat };
  }

  // ==================== COMPTE DE RESULTAT (Income Statement) ====================

  /**
   * Compte de resultat SYSCOHADA EMF
   * CHARGES : classe 6 (solde debiteur)
   * PRODUITS : classe 7 (solde crediteur)
   * Resultat = Produits - Charges
   */
  async getCompteResultat(startDate?: string, endDate?: string) {
    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); where.date.lte = d; }
    }

    const accounts = await this.prisma.accountPlan.findMany({
      where: { level: { gte: 2 }, type: { in: ['CHARGE', 'PRODUIT'] } },
      orderBy: { code: 'asc' },
    });

    const charges: any[] = [];
    const produits: any[] = [];
    let totalCharges = 0;
    let totalProduits = 0;

    for (const acc of accounts) {
      const result = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { ...where, accountId: acc.id },
      });

      const totalDebit = Number(result._sum.debit || 0);
      const totalCredit = Number(result._sum.credit || 0);
      if (totalDebit === 0 && totalCredit === 0) continue;

      if (acc.type === 'CHARGE') {
        const solde = totalDebit - totalCredit;
        charges.push({ code: acc.code, name: acc.name, solde: solde > 0 ? solde : 0 });
        totalCharges += solde > 0 ? solde : 0;
      } else {
        const solde = totalCredit - totalDebit;
        produits.push({ code: acc.code, name: acc.name, solde: solde > 0 ? solde : 0 });
        totalProduits += solde > 0 ? solde : 0;
      }
    }

    const resultat = totalProduits - totalCharges;

    return { charges, produits, totalCharges, totalProduits, resultat };
  }

  // ==================== FLUX DE TRESORERIE (Cash Flow Statement) ====================

  /**
   * Helper : calcule le flux net d'un ensemble de comptes sur une periode
   * flux = sum(credit) - sum(debit) pour comptes PASSIF/PRODUIT (entrees de tresorerie)
   * flux = sum(debit) - sum(credit) pour comptes ACTIF/CHARGE (sorties de tresorerie)
   */
  private async getAccountFlow(codes: string[], where: any): Promise<{ code: string; name: string; flux: number }[]> {
    const results: { code: string; name: string; flux: number }[] = [];
    for (const code of codes) {
      const acc = await this.prisma.accountPlan.findUnique({ where: { code } });
      if (!acc) continue;
      const agg = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { ...where, accountId: acc.id },
      });
      const d = Number(agg._sum.debit || 0);
      const c = Number(agg._sum.credit || 0);
      if (d === 0 && c === 0) continue;
      results.push({ code: acc.code, name: acc.name, flux: c - d });
    }
    return results;
  }

  /**
   * Flux de tresorerie SYSCOHADA EMF
   * 3 sections : Exploitation, Investissement, Financement
   */
  async getFluxTresorerie(startDate?: string, endDate?: string) {
    const periodWhere: any = {};
    if (startDate || endDate) {
      periodWhere.date = {};
      if (startDate) periodWhere.date.gte = new Date(startDate);
      if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); periodWhere.date.lte = d; }
    }

    // Tresorerie d'ouverture (solde comptes 10x, 11x AVANT la periode)
    let tresorerieOuverture = 0;
    if (startDate) {
      const beforeWhere = { date: { lt: new Date(startDate) } };
      const tresoAccounts = await this.prisma.accountPlan.findMany({
        where: { code: { in: ['101', '102', '111'] } },
      });
      for (const acc of tresoAccounts) {
        const agg = await this.prisma.journalEntry.aggregate({
          _sum: { debit: true, credit: true },
          where: { ...beforeWhere, accountId: acc.id },
        });
        tresorerieOuverture += Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0);
      }
    }

    // ---- EXPLOITATION ----
    // Produits d'exploitation encaisses
    const produitsExpl = await this.getAccountFlow(['701', '702', '703', '71'], periodWhere);
    // Charges d'exploitation decaissees (flux negatif = sortie)
    const chargesExpl = await this.getAccountFlow(['601', '61', '62'], periodWhere);
    // Variation des depots clientele (hausse = entree de tresorerie)
    const variationDepots = await this.getAccountFlow(['221', '222', '223'], periodWhere);
    // Variation des credits (hausse credits = sortie de tresorerie, on inverse le signe)
    const variationCreditsRaw = await this.getAccountFlow(['201', '202', '203'], periodWhere);
    const variationCredits = variationCreditsRaw.map(v => ({ ...v, flux: -v.flux }));
    // Provisions et creances douteuses
    const provisions = await this.getAccountFlow(['23', '21', '64'], periodWhere);
    // TVA nette
    const tva = await this.getAccountFlow(['451', '452'], periodWhere);

    const exploitationDetails = [
      ...produitsExpl.map(p => ({ ...p, categorie: 'Produits encaisses' })),
      ...chargesExpl.map(c => ({ ...c, categorie: 'Charges decaissees' })),
      ...variationDepots.map(d => ({ ...d, categorie: 'Variation depots clientele' })),
      ...variationCredits.map(c => ({ ...c, categorie: 'Variation credits clientele' })),
      ...provisions.map(p => ({ ...p, categorie: 'Provisions et creances' })),
      ...tva.map(t => ({ ...t, categorie: 'TVA' })),
    ];
    const fluxExploitation = exploitationDetails.reduce((s, l) => s + l.flux, 0);

    // ---- INVESTISSEMENT ----
    const investDetails = await this.getAccountFlow(['31', '32', '33'], periodWhere);
    const investissement = investDetails.map(i => ({ ...i, categorie: 'Immobilisations' }));
    const fluxInvestissement = investissement.reduce((s, l) => s + l.flux, 0);

    // ---- FINANCEMENT ----
    const financementDetails = await this.getAccountFlow(['40', '41', '42'], periodWhere);
    const financement = financementDetails.map(f => ({ ...f, categorie: 'Capitaux propres' }));
    const fluxFinancement = financement.reduce((s, l) => s + l.flux, 0);

    // Variation nette de tresorerie
    const variationNette = fluxExploitation + fluxInvestissement + fluxFinancement;
    const tresorerieCloture = tresorerieOuverture + variationNette;

    return {
      tresorerieOuverture,
      exploitation: { details: exploitationDetails, total: fluxExploitation },
      investissement: { details: investissement, total: fluxInvestissement },
      financement: { details: financement, total: fluxFinancement },
      variationNette,
      tresorerieCloture,
    };
  }

  // ==================== PERIODES COMPTABLES ====================

  async createPeriod(data: { name: string; startDate: string; endDate: string }) {
    return this.prisma.accountingPeriod.create({
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });
  }

  async closePeriod(id: string, userId: string) {
    const period = await this.prisma.accountingPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Periode non trouvee');
    if (period.status === 'CLOSED') throw new BadRequestException('Periode deja cloturee');

    const result = await this.prisma.accountingPeriod.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), closedBy: userId },
    });

    await this.auditService.log({
      userId,
      action: 'CLOSE_PERIOD',
      module: 'ACCOUNTING',
      entityId: id,
      entityType: 'AccountingPeriod',
      details: `Cloture de la periode: ${period.name}`,
      oldValues: { status: period.status },
      newValues: { status: 'CLOSED' },
    }).catch(() => {});

    return result;
  }

  async getPeriods() {
    return this.prisma.accountingPeriod.findMany({ orderBy: { startDate: 'desc' } });
  }

  /**
   * Statistiques d'une periode comptable (nombre ecritures, totaux debits/credits)
   */
  async getPeriodStats(id: string) {
    const period = await this.prisma.accountingPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Periode non trouvee');

    const where = {
      date: { gte: period.startDate, lte: period.endDate },
    };

    const [count, sums] = await Promise.all([
      this.prisma.journalEntry.count({ where }),
      this.prisma.journalEntry.aggregate({ _sum: { debit: true, credit: true }, where }),
    ]);

    const totalDebit = Number(sums._sum.debit || 0);
    const totalCredit = Number(sums._sum.credit || 0);

    // Compter les caisses encore ouvertes pendant cette periode
    const openCashRegisters = await this.prisma.cashRegister.count({
      where: {
        status: 'OPEN',
        openedAt: { lte: period.endDate },
      },
    });

    return {
      period,
      entriesCount: count,
      totalDebit,
      totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      openCashRegisters,
    };
  }

  /**
   * Cloture annuelle : ferme la periode + genere l'ecriture de resultat
   * Produits (classe 7) - Charges (classe 6) => Compte 43 Resultat
   */
  async closeAnnualPeriod(id: string, userId: string, agencyId: string) {
    const period = await this.prisma.accountingPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Periode non trouvee');
    if (period.status === 'CLOSED') throw new BadRequestException('Periode deja cloturee');

    const where = {
      date: { gte: period.startDate, lte: period.endDate },
    };

    // Calculer le resultat
    const chargeAccounts = await this.prisma.accountPlan.findMany({
      where: { type: 'CHARGE', level: { gte: 2 } },
    });
    const produitAccounts = await this.prisma.accountPlan.findMany({
      where: { type: 'PRODUIT', level: { gte: 2 } },
    });

    let totalCharges = 0;
    for (const acc of chargeAccounts) {
      const r = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { ...where, accountId: acc.id },
      });
      totalCharges += Number(r._sum.debit || 0) - Number(r._sum.credit || 0);
    }

    let totalProduits = 0;
    for (const acc of produitAccounts) {
      const r = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { ...where, accountId: acc.id },
      });
      totalProduits += Number(r._sum.credit || 0) - Number(r._sum.debit || 0);
    }

    const resultat = totalProduits - totalCharges;

    // Ecriture de determination du resultat
    // Benefice : Debit 7xx (solde produits) / Credit 43 (Resultat)
    // Perte : Debit 43 (Resultat) / Credit 6xx (solde charges)
    const entries: any[] = [];
    if (Math.abs(resultat) > 0) {
      if (resultat >= 0) {
        // Benefice : vider les produits vers 43
        entries.push(await this.createEntry({
          date: period.endDate,
          debitAccountCode: '70',
          creditAccountCode: '43',
          amount: resultat,
          label: `Determination du resultat - Benefice exercice ${period.name}`,
          reference: `CLOTURE-${period.name}`,
          sourceModule: 'ACCOUNTING',
          agencyId,
        }));
      } else {
        // Perte : vider les charges vers 43
        entries.push(await this.createEntry({
          date: period.endDate,
          debitAccountCode: '43',
          creditAccountCode: '60',
          amount: Math.abs(resultat),
          label: `Determination du resultat - Perte exercice ${period.name}`,
          reference: `CLOTURE-${period.name}`,
          sourceModule: 'ACCOUNTING',
          agencyId,
        }));
      }
    }

    // Cloturer la periode
    const closed = await this.prisma.accountingPeriod.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), closedBy: userId },
    });

    await this.auditService.log({
      userId,
      action: 'CLOSE_PERIOD',
      module: 'ACCOUNTING',
      entityId: id,
      entityType: 'AccountingPeriod',
      details: `Cloture annuelle: ${period.name} - Resultat: ${resultat >= 0 ? 'BENEFICE' : 'PERTE'} ${Math.abs(resultat)} FCFA`,
      oldValues: { status: period.status },
      newValues: { status: 'CLOSED', resultat, type: resultat >= 0 ? 'BENEFICE' : 'PERTE' },
    }).catch(() => {});

    return {
      period: closed,
      resultat,
      type: resultat >= 0 ? 'BENEFICE' : 'PERTE',
      entries: entries.length,
    };
  }

  // ==================== CLOTURES JOURNALIERE & MENSUELLE ====================

  /**
   * Cloture journaliere (End of Day)
   * 1. Verifier que toutes les caisses sont fermees
   * 2. Controle d'equilibre (debits = credits)
   * 3. Generer le journal de la journee
   * 4. Verrouiller la journee (creer une periode CLOSED)
   */
  async closeDailyPeriod(date: string, userId: string, agencyId?: string) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const agencyFilter = agencyId ? { agencyId } : {};

    // 1. Verifier que toutes les caisses sont fermees
    const openCashRegisters = await this.prisma.cashRegister.findMany({
      where: {
        ...agencyFilter,
        status: 'OPEN',
        openedAt: { lt: nextDay },
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (openCashRegisters.length > 0) {
      const names = openCashRegisters.map(cr => `${cr.user.firstName} ${cr.user.lastName}`).join(', ');
      throw new BadRequestException(
        `Impossible de cloturer : ${openCashRegisters.length} caisse(s) encore ouverte(s) (${names}). Fermez toutes les caisses avant la cloture.`
      );
    }

    // 2. Controle d'equilibre
    const dateWhere = { date: { gte: targetDate, lt: nextDay } };
    const sums = await this.prisma.journalEntry.aggregate({
      _sum: { debit: true, credit: true },
      _count: true,
      where: dateWhere,
    });

    const totalDebit = Number(sums._sum.debit || 0);
    const totalCredit = Number(sums._sum.credit || 0);
    const ecart = Math.abs(totalDebit - totalCredit);

    if (ecart > 1) {
      throw new BadRequestException(
        `Desequilibre comptable : Debits = ${totalDebit} FCFA, Credits = ${totalCredit} FCFA (ecart: ${ecart} FCFA)`
      );
    }

    // 3. Compter les operations du jour
    const [depositsCount, withdrawalsCount, creditsCount] = await Promise.all([
      this.prisma.transaction.count({ where: { ...agencyFilter, type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: targetDate, lt: nextDay } } }),
      this.prisma.transaction.count({ where: { ...agencyFilter, type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: targetDate, lt: nextDay } } }),
      this.prisma.transaction.count({ where: { ...agencyFilter, type: 'TRANSFER', status: 'COMPLETED', createdAt: { gte: targetDate, lt: nextDay } } }),
    ]);

    // 4. Creer et cloturer la periode journaliere
    const dateStr = targetDate.toISOString().slice(0, 10);
    const period = await this.prisma.accountingPeriod.create({
      data: {
        name: `Journee ${dateStr}`,
        startDate: targetDate,
        endDate: new Date(nextDay.getTime() - 1),
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: userId,
      },
    });

    await this.auditService.log({
      userId,
      action: 'CLOSE_PERIOD',
      module: 'ACCOUNTING',
      entityId: period.id,
      entityType: 'AccountingPeriod',
      details: `Cloture journaliere du ${dateStr}`,
      newValues: { status: 'CLOSED', totalDebit, totalCredit },
    }).catch(() => {});

    return {
      period,
      date: dateStr,
      summary: {
        entriesCount: sums._count || 0,
        totalDebit,
        totalCredit,
        balanced: ecart < 1,
        depositsCount,
        withdrawalsCount,
        transfersCount: creditsCount,
      },
      message: `Cloture journaliere du ${dateStr} effectuee avec succes`,
    };
  }

  /**
   * Cloture mensuelle
   * 1. Generer la balance mensuelle
   * 2. Frais de tenue de compte
   * 3. Creer et cloturer la periode mensuelle
   */
  async closeMonthlyPeriod(year: number, month: number, userId: string, agencyId: string) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Verifier qu'on ne cloture pas un mois futur
    if (startDate > new Date()) {
      throw new BadRequestException('Impossible de cloturer un mois futur');
    }

    // Verifier qu'il n'existe pas deja une cloture pour ce mois
    const existing = await this.prisma.accountingPeriod.findFirst({
      where: {
        name: { startsWith: `Mois ${year}-${String(month).padStart(2, '0')}` },
        status: 'CLOSED',
      },
    });
    if (existing) {
      throw new BadRequestException(`Le mois ${year}-${String(month).padStart(2, '0')} est deja cloture`);
    }

    // Generer la balance mensuelle
    const balance = await this.getBalance(startDate.toISOString(), endDate.toISOString());

    // Statistiques du mois
    const monthWhere = { date: { gte: startDate, lte: endDate } };
    const sums = await this.prisma.journalEntry.aggregate({
      _sum: { debit: true, credit: true },
      _count: true,
      where: monthWhere,
    });

    // Creer et cloturer la periode
    const period = await this.prisma.accountingPeriod.create({
      data: {
        name: `Mois ${year}-${String(month).padStart(2, '0')}`,
        startDate,
        endDate,
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: userId,
      },
    });

    await this.auditService.log({
      userId,
      action: 'CLOSE_PERIOD',
      module: 'ACCOUNTING',
      entityId: period.id,
      entityType: 'AccountingPeriod',
      details: `Cloture mensuelle ${year}-${String(month).padStart(2, '0')}`,
      newValues: { status: 'CLOSED', totalDebit: Number(sums._sum.debit || 0), totalCredit: Number(sums._sum.credit || 0) },
    }).catch(() => {});

    return {
      period,
      summary: {
        entriesCount: sums._count || 0,
        totalDebit: Number(sums._sum.debit || 0),
        totalCredit: Number(sums._sum.credit || 0),
        accountsWithMovement: balance.length,
      },
      balance,
      message: `Cloture mensuelle ${year}-${String(month).padStart(2, '0')} effectuee`,
    };
  }

  // ==================== ECRITURES AUTOMATIQUES SUPPLEMENTAIRES ====================

  /**
   * Ecriture auto : Frais d'ouverture de compte
   * Debit: 221 Comptes courants | Credit: 702 Commissions
   */
  async recordAccountOpeningFees(agencyId: string, amount: number, reference: string) {
    return this.createEntry({
      date: new Date(),
      debitAccountCode: '221',
      creditAccountCode: '702',
      amount,
      label: `Frais ouverture compte - ${reference}`,
      reference,
      sourceModule: 'ACCOUNT',
      agencyId,
    });
  }

  /**
   * Ecriture auto : Cloture de compte (restitution solde)
   * Debit: 221 Comptes courants | Credit: 101 Caisse
   */
  async recordAccountClosure(agencyId: string, amount: number, reference: string) {
    if (amount <= 0) return null;
    return this.createEntry({
      date: new Date(),
      debitAccountCode: '221',
      creditAccountCode: '101',
      amount,
      label: `Cloture compte - restitution solde - ${reference}`,
      reference,
      sourceModule: 'ACCOUNT',
      agencyId,
    });
  }

  /**
   * Ecriture auto : Frais de tenue de compte
   * Debit: 221 Comptes courants | Credit: 702 Commissions
   */
  async recordMaintenanceFees(agencyId: string, amount: number, reference: string) {
    return this.createEntry({
      date: new Date(),
      debitAccountCode: '221',
      creditAccountCode: '702',
      amount,
      label: `Frais tenue de compte - ${reference}`,
      reference,
      sourceModule: 'ACCOUNT',
      agencyId,
    });
  }

  /**
   * Ecriture auto : Capitalisation interets epargne
   * Debit: 601 Interets sur depots | Credit: 222 Comptes d'epargne
   */
  async recordInterestCapitalization(agencyId: string, amount: number, reference: string) {
    return this.createEntry({
      date: new Date(),
      debitAccountCode: '601',
      creditAccountCode: '222',
      amount,
      label: `Capitalisation interets epargne - ${reference}`,
      reference,
      sourceModule: 'SAVINGS',
      agencyId,
    });
  }

  /**
   * Ecriture auto : Penalites de retard credit
   * Debit: 221 Comptes courants | Credit: 703 Penalites de retard
   */
  async recordLatePenalty(agencyId: string, amount: number, reference: string) {
    return this.createEntry({
      date: new Date(),
      debitAccountCode: '221',
      creditAccountCode: '703',
      amount,
      label: `Penalite retard credit - ${reference}`,
      reference,
      sourceModule: 'CREDIT',
      agencyId,
    });
  }

  /**
   * Ecriture auto : Radiation de creance (write-off)
   * Debit: 64 Dotations aux provisions | Credit: 201 Credits
   */
  async recordWriteOff(agencyId: string, amount: number, reference: string) {
    return this.createEntry({
      date: new Date(),
      debitAccountCode: '64',
      creditAccountCode: '201',
      amount,
      label: `Radiation creance irrecouvrable - ${reference}`,
      reference,
      sourceModule: 'CREDIT',
      agencyId,
    });
  }

  // ==================== RAPPROCHEMENT BANCAIRE ====================

  /**
   * Importer des lignes de releve bancaire
   */
  async importBankStatementLines(lines: { date: string; reference?: string; label: string; debit: number; credit: number; balance?: number }[]) {
    const created = await this.prisma.bankStatementLine.createMany({
      data: lines.map(l => ({
        date: new Date(l.date),
        reference: l.reference || null,
        label: l.label,
        debit: l.debit,
        credit: l.credit,
        balance: l.balance ?? null,
      })),
    });
    return { imported: created.count };
  }

  /**
   * Recuperer les lignes du releve bancaire
   */
  async getBankStatementLines(params: { startDate?: string; endDate?: string; matched?: string }) {
    const where: any = {};
    if (params.startDate || params.endDate) {
      where.date = {};
      if (params.startDate) where.date.gte = new Date(params.startDate);
      if (params.endDate) { const d = new Date(params.endDate); d.setHours(23, 59, 59, 999); where.date.lte = d; }
    }
    if (params.matched === 'true') where.matched = true;
    if (params.matched === 'false') where.matched = false;

    const [lines, total, sums] = await Promise.all([
      this.prisma.bankStatementLine.findMany({ where, orderBy: { date: 'desc' } }),
      this.prisma.bankStatementLine.count({ where }),
      this.prisma.bankStatementLine.aggregate({ _sum: { debit: true, credit: true }, where }),
    ]);

    return {
      lines,
      total,
      totalDebit: Number(sums._sum.debit || 0),
      totalCredit: Number(sums._sum.credit || 0),
    };
  }

  /**
   * Rapprochement automatique : match par montant + date (+/- 2 jours) + reference
   */
  async autoReconcile(startDate?: string, endDate?: string) {
    // Ecritures internes sur compte 111 (Banque)
    const bankAccount = await this.prisma.accountPlan.findUnique({ where: { code: '111' } });
    if (!bankAccount) throw new NotFoundException('Compte 111 non trouve');

    const dateWhere: any = {};
    if (startDate || endDate) {
      dateWhere.date = {};
      if (startDate) dateWhere.date.gte = new Date(startDate);
      if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); dateWhere.date.lte = d; }
    }

    const internalEntries = await this.prisma.journalEntry.findMany({
      where: { accountId: bankAccount.id, ...dateWhere },
      orderBy: { date: 'asc' },
    });

    const bankLines = await this.prisma.bankStatementLine.findMany({
      where: { matched: false, ...dateWhere },
      orderBy: { date: 'asc' },
    });

    let matchCount = 0;
    const matchedInternalIds = new Set<string>();
    const matchedBankIds = new Set<string>();

    for (const line of bankLines) {
      const lineAmount = Number(line.debit) > 0 ? Number(line.debit) : Number(line.credit);
      const lineIsDebit = Number(line.debit) > 0;

      for (const entry of internalEntries) {
        if (matchedInternalIds.has(entry.id)) continue;

        const entryAmount = lineIsDebit ? Number(entry.credit) : Number(entry.debit);
        if (Math.abs(entryAmount - lineAmount) > 0.01) continue;

        // Verifier la date (+/- 2 jours)
        const daysDiff = Math.abs(
          (new Date(line.date).getTime() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff > 2) continue;

        // Match trouve
        await this.prisma.bankStatementLine.update({
          where: { id: line.id },
          data: { matched: true, matchedJournalId: entry.id, reconciliationDate: new Date() },
        });

        matchedInternalIds.add(entry.id);
        matchedBankIds.add(line.id);
        matchCount++;
        break;
      }
    }

    return { matched: matchCount, remaining: bankLines.length - matchCount };
  }

  /**
   * Rapprocher manuellement une ligne bancaire avec une ecriture interne
   */
  async manualMatch(bankLineId: string, journalEntryId: string) {
    const line = await this.prisma.bankStatementLine.findUnique({ where: { id: bankLineId } });
    if (!line) throw new NotFoundException('Ligne bancaire non trouvee');

    await this.prisma.bankStatementLine.update({
      where: { id: bankLineId },
      data: { matched: true, matchedJournalId: journalEntryId, reconciliationDate: new Date() },
    });

    return { success: true };
  }

  /**
   * Annuler un rapprochement
   */
  async unmatch(bankLineId: string) {
    await this.prisma.bankStatementLine.update({
      where: { id: bankLineId },
      data: { matched: false, matchedJournalId: null, reconciliationDate: null },
    });
    return { success: true };
  }

  /**
   * Synthese du rapprochement bancaire
   */
  async getReconciliationSummary(startDate?: string, endDate?: string) {
    const bankAccount = await this.prisma.accountPlan.findUnique({ where: { code: '111' } });

    const dateWhere: any = {};
    if (startDate || endDate) {
      dateWhere.date = {};
      if (startDate) dateWhere.date.gte = new Date(startDate);
      if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); dateWhere.date.lte = d; }
    }

    // Solde interne (ecritures sur compte 111)
    let soldeInterne = 0;
    if (bankAccount) {
      const agg = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: { accountId: bankAccount.id, ...dateWhere },
      });
      soldeInterne = Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0);
    }

    // Lignes bancaires
    const [totalBank, matchedBank, unmatchedBank] = await Promise.all([
      this.prisma.bankStatementLine.aggregate({
        _sum: { debit: true, credit: true },
        _count: true,
        where: dateWhere,
      }),
      this.prisma.bankStatementLine.aggregate({
        _sum: { debit: true, credit: true },
        _count: true,
        where: { matched: true, ...dateWhere },
      }),
      this.prisma.bankStatementLine.aggregate({
        _sum: { debit: true, credit: true },
        _count: true,
        where: { matched: false, ...dateWhere },
      }),
    ]);

    const soldeBanque = Number(totalBank._sum.credit || 0) - Number(totalBank._sum.debit || 0);

    // Ecritures internes sans match
    let internalUnmatched = 0;
    if (bankAccount) {
      const matchedJournalIds = (await this.prisma.bankStatementLine.findMany({
        where: { matched: true, matchedJournalId: { not: null }, ...dateWhere },
        select: { matchedJournalId: true },
      })).map(l => l.matchedJournalId!);

      const unmatchedInternal = await this.prisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
        where: {
          accountId: bankAccount.id,
          ...dateWhere,
          ...(matchedJournalIds.length > 0 ? { id: { notIn: matchedJournalIds } } : {}),
        },
      });
      internalUnmatched = Number(unmatchedInternal._sum.debit || 0) - Number(unmatchedInternal._sum.credit || 0);
    }

    return {
      soldeInterne,
      soldeBanque,
      ecart: soldeInterne - soldeBanque,
      lignesBancaires: {
        total: totalBank._count || 0,
        rapprochees: matchedBank._count || 0,
        nonRapprochees: unmatchedBank._count || 0,
      },
      montantsNonRapproches: {
        banque: Number(unmatchedBank._sum.credit || 0) - Number(unmatchedBank._sum.debit || 0),
        interne: internalUnmatched,
      },
    };
  }

  /**
   * Supprimer une ligne de releve bancaire
   */
  async deleteBankLine(id: string) {
    await this.prisma.bankStatementLine.delete({ where: { id } });
    return { success: true };
  }
}
