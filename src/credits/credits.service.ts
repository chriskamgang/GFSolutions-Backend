import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { SimulateCreditDto } from './dto/simulate-credit.dto';
import { CreateCreditDto } from './dto/create-credit.dto';
import { ValidateCreditDto } from './dto/validate-credit.dto';
import { CreateCreditProductDto, UpdateCreditProductDto } from './dto/credit-product.dto';

export interface AmortizationRow {
  month: number;
  principal: number;
  interest: number;
  payment: number;
  remainingBalance: number;
}

@Injectable()
export class CreditsService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
    private auditService: AuditService,
  ) {}

  /**
   * Simulateur de credit avec tableau d'amortissement
   * Deux modes : CONSTANT (annuite constante) et DEGRESSIVE (capital constant)
   */
  simulate(dto: SimulateCreditDto) {
    const { amount, interestRate, durationMonths, repaymentType = 'CONSTANT' } = dto;
    const monthlyRate = interestRate / 100 / 12;

    let schedule: AmortizationRow[];
    let monthlyPayment: number;
    let totalInterest: number;
    let totalAmount: number;

    if (repaymentType === 'CONSTANT') {
      // Annuite constante (formule classique)
      monthlyPayment = Math.round(
        (amount * monthlyRate * Math.pow(1 + monthlyRate, durationMonths)) /
        (Math.pow(1 + monthlyRate, durationMonths) - 1)
      );

      schedule = [];
      let remaining = amount;
      totalInterest = 0;

      for (let i = 1; i <= durationMonths; i++) {
        const interest = Math.round(remaining * monthlyRate);
        const principal = monthlyPayment - interest;
        remaining = Math.max(0, remaining - principal);
        totalInterest += interest;

        schedule.push({
          month: i,
          principal,
          interest,
          payment: monthlyPayment,
          remainingBalance: Math.round(remaining),
        });
      }

      // Ajuster le dernier paiement
      if (schedule.length > 0) {
        const last = schedule[schedule.length - 1];
        if (last.remainingBalance > 0) {
          last.payment += last.remainingBalance;
          last.principal += last.remainingBalance;
          last.remainingBalance = 0;
        }
      }

      totalAmount = amount + totalInterest;
    } else {
      // Amortissement constant (capital constant)
      const fixedPrincipal = Math.round(amount / durationMonths);
      schedule = [];
      let remaining = amount;
      totalInterest = 0;

      for (let i = 1; i <= durationMonths; i++) {
        const interest = Math.round(remaining * monthlyRate);
        const principal = i === durationMonths ? remaining : fixedPrincipal;
        const payment = principal + interest;
        remaining = Math.max(0, remaining - principal);
        totalInterest += interest;

        schedule.push({
          month: i,
          principal,
          interest,
          payment,
          remainingBalance: Math.round(remaining),
        });
      }

      monthlyPayment = schedule[0].payment; // Premiere echeance (la plus haute)
      totalAmount = amount + totalInterest;
    }

    return {
      amount,
      interestRate,
      durationMonths,
      repaymentType,
      monthlyPayment,
      totalInterest,
      totalAmount,
      schedule,
    };
  }

  /**
   * Creer une demande de credit
   */
  async create(dto: CreateCreditDto, userId?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client non trouve');

    // Simuler pour obtenir les montants
    const simulation = this.simulate({
      amount: dto.amount,
      interestRate: dto.interestRate,
      durationMonths: dto.durationMonths,
    });

    const creditNumber = `CRD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Valider les types de garantie
    const validGuaranteeTypes = ['REAL_ESTATE', 'ENDORSEMENT', 'PLEDGE', 'BLOCKED_SAVINGS', 'SALARY_GUARANTEE', 'VEHICLE', 'EQUIPMENT', 'STOCK', 'PERSONAL_GUARANTEE', 'JOINT_GUARANTEE'];
    if (dto.guarantees?.length) {
      for (const g of dto.guarantees) {
        if (!validGuaranteeTypes.includes(g.type)) {
          throw new BadRequestException(`Type de garantie invalide: "${g.type}". Types acceptes: ${validGuaranteeTypes.join(', ')}`);
        }
      }
    }

    const credit = await this.prisma.credit.create({
      data: {
        creditNumber,
        clientId: dto.clientId,
        amount: dto.amount,
        interestRate: dto.interestRate,
        durationMonths: dto.durationMonths,
        monthlyPayment: simulation.monthlyPayment,
        totalAmount: simulation.totalAmount,
        remainingAmount: simulation.totalAmount,
        purpose: dto.purpose,
        status: 'SUBMITTED',
        currentValidationLevel: 'AGENT',
        guarantees: dto.guarantees?.length ? {
          create: dto.guarantees.map(g => ({
            type: g.type as any,
            description: g.description,
            value: g.value,
          })),
        } : undefined,
      },
      include: { client: true, guarantees: true },
    });

    if (userId) {
      this.auditService.log({ userId, action: 'CREATE', module: 'CREDITS', entityId: credit.id, entityType: 'Credit', details: `Demande credit ${creditNumber} - ${dto.amount} FCFA` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return credit;
  }

  /**
   * Lister les credits avec filtres
   */
  async findAll(params: { page?: number; limit?: number; status?: string; clientId?: string }) {
    const { page = 1, limit = 20, status, clientId } = params;
    const where: any = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;

    const [data, total] = await Promise.all([
      this.prisma.credit.findMany({
        where,
        include: {
          client: { select: { firstName: true, lastName: true, clientNumber: true } },
          guarantees: true,
          validations: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.credit.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Detail d'un credit
   */
  async findOne(id: string) {
    const credit = await this.prisma.credit.findUnique({
      where: { id },
      include: {
        client: true,
        guarantees: true,
        repayments: { orderBy: { dueDate: 'asc' } },
        validations: {
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!credit) throw new NotFoundException('Credit non trouve');
    return credit;
  }

  /**
   * Valider/rejeter un credit (workflow multi-niveau)
   */
  async validate(creditId: string, userId: string, dto: ValidateCreditDto) {
    const credit = await this.prisma.credit.findUnique({ where: { id: creditId } });
    if (!credit) throw new NotFoundException('Credit non trouve');

    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(credit.status)) {
      throw new BadRequestException('Ce credit ne peut pas etre valide dans son statut actuel');
    }

    const validationLevels: string[] = [
      'AGENT',
      'AGENCY_MANAGER',
      'REGIONAL_DIRECTOR',
      'GENERAL_DIRECTOR',
      'CREDIT_COMMITTEE',
    ];

    const currentLevelIndex = validationLevels.indexOf(credit.currentValidationLevel);

    // Creer la validation
    await this.prisma.creditValidation.create({
      data: {
        creditId,
        level: credit.currentValidationLevel as any,
        userId,
        approved: dto.approved,
        comment: dto.comment,
      },
    });

    if (!dto.approved) {
      // Rejet
      await this.prisma.credit.update({
        where: { id: creditId },
        data: { status: 'REJECTED' },
      });
      this.auditService.log({ userId, action: 'UPDATE', module: 'CREDITS', entityId: creditId, entityType: 'Credit', details: `Credit ${credit.creditNumber} REJETE - ${dto.comment || ''}` }).catch((e) => console.error('[AUDIT]', e.message));
      return { message: 'Credit rejete', status: 'REJECTED' };
    }

    // Determine le prochain niveau ou approuve definitivement
    const nextLevelIndex = currentLevelIndex + 1;
    const creditAmount = Number(credit.amount);

    // Regles de validation selon le montant
    let needsMoreValidation = false;
    if (creditAmount >= 5000000 && nextLevelIndex <= 4) needsMoreValidation = true;
    else if (creditAmount >= 2000000 && nextLevelIndex <= 3) needsMoreValidation = true;
    else if (creditAmount >= 500000 && nextLevelIndex <= 1) needsMoreValidation = true;

    if (needsMoreValidation) {
      await this.prisma.credit.update({
        where: { id: creditId },
        data: {
          status: 'UNDER_REVIEW',
          currentValidationLevel: validationLevels[nextLevelIndex] as any,
        },
      });
      return {
        message: `Credit transmis au niveau ${validationLevels[nextLevelIndex]}`,
        status: 'UNDER_REVIEW',
        nextLevel: validationLevels[nextLevelIndex],
      };
    }

    // Approuve definitivement
    await this.prisma.credit.update({
      where: { id: creditId },
      data: { status: 'APPROVED' },
    });

    this.auditService.log({ userId, action: 'UPDATE', module: 'CREDITS', entityId: creditId, entityType: 'Credit', details: `Credit ${credit.creditNumber} APPROUVE` }).catch((e) => console.error('[AUDIT]', e.message));

    return { message: 'Credit approuve', status: 'APPROVED' };
  }

  /**
   * Decaisser un credit approuve
   */
  async disburse(creditId: string, userId?: string) {
    const credit = await this.prisma.credit.findUnique({
      where: { id: creditId },
      include: { client: { include: { accounts: true } } },
    });

    if (!credit) throw new NotFoundException('Credit non trouve');
    if (credit.status !== 'APPROVED') {
      throw new BadRequestException('Le credit doit etre approuve avant decaissement');
    }

    // Trouver le compte courant du client
    const currentAccount = credit.client.accounts.find(a => a.type === 'CURRENT' && a.status === 'ACTIVE');
    if (!currentAccount) {
      throw new BadRequestException('Le client n\'a pas de compte courant actif');
    }

    // Creer les echeances de remboursement
    const simulation = this.simulate({
      amount: Number(credit.amount),
      interestRate: Number(credit.interestRate),
      durationMonths: credit.durationMonths,
    });

    const repayments = simulation.schedule.map(row => {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + row.month);
      return {
        creditId,
        dueDate,
        amount: row.payment,
        status: 'PENDING' as const,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      // Crediter le compte du client
      await tx.account.update({
        where: { id: currentAccount.id },
        data: { balance: { increment: Number(credit.amount) } },
      });

      // Creer les echeances
      await tx.repayment.createMany({ data: repayments });

      // Mettre a jour le statut du credit
      await tx.credit.update({
        where: { id: creditId },
        data: {
          status: 'DISBURSED',
          disbursedAt: new Date(),
        },
      });
    });

    // Ecriture comptable automatique : Debit Credits (201/202/203) | Credit Comptes courants (221)
    try {
      const agencyId = currentAccount.agencyId;
      if (agencyId) {
        await this.accountingService.recordCreditDisbursement(
          agencyId, Number(credit.amount), credit.durationMonths, credit.creditNumber,
        );
      }
    } catch (e) {
      console.error(`[COMPTA] Echec ecriture decaissement ${credit.creditNumber}:`, e.message);
    }

    if (userId) {
      this.auditService.log({ userId, action: 'UPDATE', module: 'CREDITS', entityId: creditId, entityType: 'Credit', details: `Decaissement ${Number(credit.amount)} FCFA - ${credit.creditNumber} -> compte ${currentAccount.accountNumber}` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return { message: 'Credit decaisse avec succes', accountCredited: currentAccount.accountNumber };
  }

  /**
   * Enregistrer un remboursement
   */
  async recordRepayment(repaymentId: string, amount: number, userId?: string) {
    const repayment = await this.prisma.repayment.findUnique({
      where: { id: repaymentId },
      include: {
        credit: {
          include: { client: { include: { accounts: { where: { type: 'CURRENT', status: 'ACTIVE' }, take: 1 } } } },
        },
      },
    });

    if (!repayment) throw new NotFoundException('Echeance non trouvee');
    if ((repayment.status as string) === 'PAID') throw new BadRequestException('Echeance deja payee');

    const dueAmount = Number(repayment.amount);
    let penalty = 0;

    // Penalite si en retard
    if (new Date() > repayment.dueDate && repayment.status !== 'PAID') {
      penalty = Math.round(dueAmount * 0.02); // 2% penalite
    }

    // Estimer la repartition capital/interets depuis la simulation
    const simulation = this.simulate({
      amount: Number(repayment.credit.amount),
      interestRate: Number(repayment.credit.interestRate),
      durationMonths: repayment.credit.durationMonths,
    });
    // Trouver l'echeance correspondante dans le tableau d'amortissement
    const paidCount = await this.prisma.repayment.count({
      where: { creditId: repayment.creditId, status: 'PAID' },
    });
    const scheduleRow = simulation.schedule[paidCount] || simulation.schedule[simulation.schedule.length - 1];
    const principalPart = scheduleRow?.principal || amount;
    const interestPart = scheduleRow?.interest || 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.repayment.update({
        where: { id: repaymentId },
        data: {
          paidAmount: amount,
          penalty,
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      // Reduire le restant du credit
      await tx.credit.update({
        where: { id: repayment.creditId },
        data: { remainingAmount: { decrement: amount } },
      });

      // Verifier si tout est rembourse
      const unpaid = await tx.repayment.count({
        where: { creditId: repayment.creditId, status: { not: 'PAID' } },
      });

      if (unpaid === 0) {
        await tx.credit.update({
          where: { id: repayment.creditId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }
    });

    // Ecriture comptable : Debit Comptes courants (221) | Credit Credits (201) + Interets (701)
    try {
      const agencyId = repayment.credit.client.accounts[0]?.agencyId;
      if (agencyId) {
        await this.accountingService.recordCreditRepayment(
          agencyId, principalPart, interestPart, repayment.credit.creditNumber,
        );
      }
    } catch (e) {
      console.error(`[COMPTA] Echec ecriture remboursement ${repayment.credit.creditNumber}:`, e.message);
    }

    if (userId) {
      this.auditService.log({ userId, action: 'UPDATE', module: 'CREDITS', entityId: repayment.creditId, entityType: 'Repayment', details: `Remboursement ${amount} FCFA - ${repayment.credit.creditNumber}${penalty > 0 ? ` (penalite: ${penalty})` : ''}` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return { message: 'Remboursement enregistre', penalty };
  }

  /**
   * Scoring credit : 7 categories, score 0-100
   */
  async scoreCredit(creditId: string) {
    const credit = await this.prisma.credit.findUnique({
      where: { id: creditId },
      include: {
        client: { include: { accounts: true } },
        guarantees: true,
      },
    });
    if (!credit) throw new NotFoundException('Credit non trouve');

    const clientId = credit.clientId;
    const amount = Number(credit.amount);

    // 1. Anciennete client (0-15)
    const clientCreatedAt = credit.client.createdAt;
    const monthsAsClient = Math.floor((Date.now() - clientCreatedAt.getTime()) / (30 * 24 * 3600 * 1000));
    let ancienneteScore = 0;
    if (monthsAsClient >= 24) ancienneteScore = 15;
    else if (monthsAsClient >= 12) ancienneteScore = 12;
    else if (monthsAsClient >= 6) ancienneteScore = 8;
    else if (monthsAsClient >= 3) ancienneteScore = 4;

    // 2. Historique de remboursement (0-20)
    const pastCredits = await this.prisma.credit.findMany({
      where: { clientId, status: { in: ['COMPLETED', 'ACTIVE', 'DISBURSED'] } },
      include: { repayments: true },
    });
    let historiqueScore = 0;
    if (pastCredits.length > 0) {
      const totalRepayments = pastCredits.reduce((sum, c) => sum + c.repayments.length, 0);
      const lateRepayments = pastCredits.reduce((sum, c) => {
        return sum + c.repayments.filter(r =>
          r.status === 'PAID' && r.paidAt && r.paidAt > r.dueDate
        ).length;
      }, 0);
      const onTimeRate = totalRepayments > 0 ? (totalRepayments - lateRepayments) / totalRepayments : 0;
      if (onTimeRate >= 0.95) historiqueScore = 20;
      else if (onTimeRate >= 0.85) historiqueScore = 15;
      else if (onTimeRate >= 0.70) historiqueScore = 10;
      else historiqueScore = 5;
      // Bonus pour credits completes
      const completed = pastCredits.filter(c => c.status === 'COMPLETED').length;
      if (completed >= 3) historiqueScore = Math.min(20, historiqueScore + 3);
      else if (completed >= 1) historiqueScore = Math.min(20, historiqueScore + 1);
    }

    // 3. Capacite de remboursement / revenu (0-20)
    const revenu = Number(credit.client.revenuMensuel || 0);
    const monthlyPayment = Number(credit.monthlyPayment);
    let capaciteScore = 0;
    if (revenu > 0) {
      const ratio = monthlyPayment / revenu;
      if (ratio <= 0.25) capaciteScore = 20;
      else if (ratio <= 0.33) capaciteScore = 15;
      else if (ratio <= 0.45) capaciteScore = 10;
      else if (ratio <= 0.60) capaciteScore = 5;
    } else {
      capaciteScore = 5; // revenu inconnu
    }

    // 4. Garanties (0-15)
    const totalGuaranteeValue = credit.guarantees.reduce((sum, g) => sum + Number(g.value), 0);
    let garantiesScore = 0;
    if (totalGuaranteeValue >= amount * 1.5) garantiesScore = 15;
    else if (totalGuaranteeValue >= amount) garantiesScore = 12;
    else if (totalGuaranteeValue >= amount * 0.5) garantiesScore = 8;
    else if (totalGuaranteeValue > 0) garantiesScore = 4;

    // 5. Taux d'endettement (0-10)
    const activeCredits = await this.prisma.credit.findMany({
      where: { clientId, status: { in: ['DISBURSED', 'ACTIVE'] }, id: { not: creditId } },
    });
    const totalDebt = activeCredits.reduce((sum, c) => sum + Number(c.remainingAmount), 0) + Number(credit.totalAmount);
    let endettementScore = 0;
    if (revenu > 0) {
      const debtRatio = totalDebt / (revenu * 12);
      if (debtRatio <= 2) endettementScore = 10;
      else if (debtRatio <= 4) endettementScore = 7;
      else if (debtRatio <= 6) endettementScore = 4;
    } else {
      endettementScore = activeCredits.length === 0 ? 7 : 3;
    }

    // 6. Secteur d'activite (0-10)
    const secteur = credit.client.secteurActivite || '';
    const secteursStables = ['FONCTIONNAIRE', 'SANTE', 'EDUCATION', 'BANQUE', 'TELECOMMUNICATION'];
    const secteursMoyens = ['COMMERCE', 'AGRICULTURE', 'TRANSPORT', 'BTP'];
    let secteurScore = 5;
    if (secteursStables.some(s => secteur.toUpperCase().includes(s))) secteurScore = 10;
    else if (secteursMoyens.some(s => secteur.toUpperCase().includes(s))) secteurScore = 7;

    // 7. Comportement epargne (0-10)
    const savingsAccounts = credit.client.accounts.filter(a => a.type === 'SAVINGS');
    const totalSavings = savingsAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
    let epargneScore = 0;
    if (totalSavings >= amount * 0.3) epargneScore = 10;
    else if (totalSavings >= amount * 0.15) epargneScore = 7;
    else if (totalSavings > 0) epargneScore = 4;

    const total = ancienneteScore + historiqueScore + capaciteScore + garantiesScore + endettementScore + secteurScore + epargneScore;
    const categories = [
      { name: 'Anciennete client', score: ancienneteScore, max: 15, detail: `${monthsAsClient} mois` },
      { name: 'Historique remboursement', score: historiqueScore, max: 20, detail: `${pastCredits.length} credit(s) passe(s)` },
      { name: 'Capacite de remboursement', score: capaciteScore, max: 20, detail: revenu > 0 ? `${Math.round(monthlyPayment / revenu * 100)}% du revenu` : 'Revenu non renseigne' },
      { name: 'Garanties', score: garantiesScore, max: 15, detail: `${totalGuaranteeValue.toLocaleString('fr-FR')} FCFA (${credit.guarantees.length} garantie(s))` },
      { name: 'Taux d\'endettement', score: endettementScore, max: 10, detail: `${activeCredits.length} credit(s) en cours` },
      { name: 'Secteur d\'activite', score: secteurScore, max: 10, detail: secteur || 'Non renseigne' },
      { name: 'Comportement epargne', score: epargneScore, max: 10, detail: `${totalSavings.toLocaleString('fr-FR')} FCFA d'epargne` },
    ];

    let risk: string;
    if (total >= 75) risk = 'FAIBLE';
    else if (total >= 55) risk = 'MODERE';
    else if (total >= 35) risk = 'ELEVE';
    else risk = 'TRES_ELEVE';

    let recommendation: string;
    if (total >= 75) recommendation = 'Demande recommandee pour approbation';
    else if (total >= 55) recommendation = 'Demande acceptable avec conditions supplementaires';
    else if (total >= 35) recommendation = 'Demande a risque - garanties supplementaires requises';
    else recommendation = 'Demande deconseillée - risque tres eleve';

    // Sauvegarder le scoring
    await this.prisma.credit.update({
      where: { id: creditId },
      data: { scoringTotal: total, scoringDetails: { categories, risk, recommendation } as any },
    });

    return { creditId, total, maxScore: 100, risk, recommendation, categories };
  }

  /**
   * Generer le contrat PDF (retourne buffer base64)
   */
  async generateContract(creditId: string) {
    const credit = await this.prisma.credit.findUnique({
      where: { id: creditId },
      include: {
        client: true,
        guarantees: true,
        repayments: { orderBy: { dueDate: 'asc' } },
      },
    });
    if (!credit) throw new NotFoundException('Credit non trouve');

    const simulation = this.simulate({
      amount: Number(credit.amount),
      interestRate: Number(credit.interestRate),
      durationMonths: credit.durationMonths,
    });

    const clientName = credit.client.clientType === 'MORALE'
      ? credit.client.raisonSociale || ''
      : `${credit.client.firstName} ${credit.client.lastName}`;
    const clientNumber = credit.client.clientNumber;

    return {
      creditNumber: credit.creditNumber,
      clientName,
      clientNumber,
      clientAddress: credit.client.address || 'Non renseigne',
      clientPhone: credit.client.phone,
      clientIdType: credit.client.idDocumentType || '',
      clientIdNumber: credit.client.idDocumentNumber || '',
      amount: Number(credit.amount),
      interestRate: Number(credit.interestRate),
      durationMonths: credit.durationMonths,
      monthlyPayment: Number(credit.monthlyPayment),
      totalAmount: Number(credit.totalAmount),
      purpose: credit.purpose,
      status: credit.status,
      disbursedAt: credit.disbursedAt,
      createdAt: credit.createdAt,
      guarantees: credit.guarantees.map(g => ({
        type: g.type,
        description: g.description,
        value: Number(g.value),
      })),
      schedule: simulation.schedule,
      insurance: Math.round(Number(credit.amount) * 0.02),
    };
  }

  /**
   * Restructurer un credit (defaillant ou en difficulte)
   */
  async restructureCredit(creditId: string, body: {
    newAmount: number;
    newInterestRate: number;
    newDurationMonths: number;
    reason: string;
  }, userId?: string) {
    const credit = await this.prisma.credit.findUnique({
      where: { id: creditId },
      include: { client: { include: { accounts: true } }, guarantees: true, repayments: true },
    });
    if (!credit) throw new NotFoundException('Credit non trouve');

    if (!['DISBURSED', 'ACTIVE', 'DEFAULTED'].includes(credit.status)) {
      throw new BadRequestException('Seul un credit decaisse, actif ou impaye peut etre restructure');
    }

    // Calculer le solde restant reel (echeances impayees)
    const unpaidAmount = credit.repayments
      .filter(r => r.status !== 'PAID')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const newAmount = body.newAmount || unpaidAmount;
    const simulation = this.simulate({
      amount: newAmount,
      interestRate: body.newInterestRate,
      durationMonths: body.newDurationMonths,
    });

    const creditNumber = `RST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const result = await this.prisma.$transaction(async (tx) => {
      // Marquer l'ancien credit comme RESTRUCTURED
      await tx.credit.update({
        where: { id: creditId },
        data: { status: 'RESTRUCTURED', restructuredAt: new Date() },
      });

      // Annuler les echeances impayees de l'ancien credit
      await tx.repayment.updateMany({
        where: { creditId, status: 'PENDING' },
        data: { status: 'PAID', paidAmount: 0, paidAt: new Date() },
      });

      // Creer le nouveau credit restructure
      const newCredit = await tx.credit.create({
        data: {
          creditNumber,
          clientId: credit.clientId,
          amount: newAmount,
          interestRate: body.newInterestRate,
          durationMonths: body.newDurationMonths,
          monthlyPayment: simulation.monthlyPayment,
          totalAmount: simulation.totalAmount,
          remainingAmount: simulation.totalAmount,
          purpose: `Restructuration: ${body.reason} (ex: ${credit.creditNumber})`,
          status: 'DISBURSED',
          currentValidationLevel: 'CREDIT_COMMITTEE',
          disbursedAt: new Date(),
          restructuredFromId: creditId,
        },
        include: { client: true },
      });

      // Creer les nouvelles echeances
      const repayments = simulation.schedule.map(row => {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + row.month);
        return {
          creditId: newCredit.id,
          dueDate,
          amount: row.payment,
          status: 'PENDING' as const,
        };
      });
      await tx.repayment.createMany({ data: repayments });

      // Copier les garanties
      if (credit.guarantees.length > 0) {
        await tx.guarantee.createMany({
          data: credit.guarantees.map(g => ({
            creditId: newCredit.id,
            type: g.type,
            description: g.description,
            value: g.value,
          })),
        });
      }

      return newCredit;
    });

    if (userId) {
      this.auditService.log({
        userId, action: 'UPDATE', module: 'CREDITS', entityId: creditId, entityType: 'Credit',
        details: `Restructuration ${credit.creditNumber} -> ${creditNumber} : ${newAmount} FCFA sur ${body.newDurationMonths} mois a ${body.newInterestRate}%`,
      }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return {
      message: 'Credit restructure avec succes',
      oldCreditNumber: credit.creditNumber,
      newCredit: {
        id: result.id,
        creditNumber: result.creditNumber,
        amount: Number(result.amount),
        interestRate: Number(result.interestRate),
        durationMonths: result.durationMonths,
        monthlyPayment: Number(result.monthlyPayment),
      },
      unpaidFromOld: unpaidAmount,
    };
  }

  /**
   * Statistiques credits
   */
  async getStats() {
    const [total, active, pending, defaulted, totalDisbursed] = await Promise.all([
      this.prisma.credit.count(),
      this.prisma.credit.count({ where: { status: { in: ['DISBURSED', 'ACTIVE'] } } }),
      this.prisma.credit.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.credit.count({ where: { status: 'DEFAULTED' } }),
      this.prisma.credit.aggregate({
        _sum: { amount: true },
        where: { status: { in: ['DISBURSED', 'ACTIVE', 'COMPLETED'] } },
      }),
    ]);

    // PAR (Portfolio At Risk) > 30 jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const lateRepayments = await this.prisma.repayment.count({
      where: {
        status: 'PENDING',
        dueDate: { lt: thirtyDaysAgo },
      },
    });

    const totalRepayments = await this.prisma.repayment.count({
      where: { status: { not: 'PAID' } },
    });

    const par30 = totalRepayments > 0 ? ((lateRepayments / totalRepayments) * 100).toFixed(1) : '0';

    return {
      total,
      active,
      pending,
      defaulted,
      totalDisbursed: Number(totalDisbursed._sum.amount || 0),
      par30: `${par30}%`,
      lateRepayments,
    };
  }

  // ==================== PRODUITS DE CREDIT ====================

  async createProduct(dto: CreateCreditProductDto) {
    return this.prisma.creditProduct.create({ data: dto as any });
  }

  async findAllProducts() {
    return this.prisma.creditProduct.findMany({
      include: { _count: { select: { credits: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOneProduct(id: string) {
    const product = await this.prisma.creditProduct.findUnique({
      where: { id },
      include: { _count: { select: { credits: true } } },
    });
    if (!product) throw new NotFoundException('Produit de credit non trouve');
    return product;
  }

  async updateProduct(id: string, dto: UpdateCreditProductDto) {
    await this.findOneProduct(id);
    return this.prisma.creditProduct.update({ where: { id }, data: dto as any });
  }

  // ==================== INTERETS MORATOIRES ====================

  /**
   * Calcule les interets moratoires pour toutes les echeances en retard
   * Appele par le CRON quotidien (SchedulerService)
   */
  async calculateMoratoires() {
    // Trouver toutes les echeances en retard non payees
    const overdueRepayments = await this.prisma.repayment.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: new Date() },
      },
      include: {
        credit: {
          include: { creditProduct: true },
        },
      },
    });

    let totalCalculated = 0;

    for (const repayment of overdueRepayments) {
      // Taux moratoire journalier : depuis le produit de credit ou 0.1% par defaut
      const dailyRate = repayment.credit.creditProduct
        ? Number(repayment.credit.creditProduct.latePaymentRate) / 100
        : 0.001; // 0.1% par defaut

      const daysLate = Math.floor((Date.now() - repayment.dueDate.getTime()) / (24 * 3600 * 1000));
      const moratoireAmount = Math.round(Number(repayment.amount) * dailyRate * daysLate);

      if (moratoireAmount > 0) {
        await this.prisma.repayment.update({
          where: { id: repayment.id },
          data: { moratoireAmount },
        });
        totalCalculated++;
      }
    }

    return { processed: overdueRepayments.length, updated: totalCalculated };
  }

  /**
   * Enregistrer un remboursement avec ordre d'imputation :
   * moratoires d'abord, puis interets, puis capital
   */
  async recordRepaymentWithMoratoires(repaymentId: string, amount: number, userId?: string) {
    const repayment = await this.prisma.repayment.findUnique({
      where: { id: repaymentId },
      include: {
        credit: {
          include: {
            creditProduct: true,
            client: { include: { accounts: { where: { type: 'CURRENT', status: 'ACTIVE' }, take: 1 } } },
          },
        },
      },
    });

    if (!repayment) throw new NotFoundException('Echeance non trouvee');
    if ((repayment.status as string) === 'PAID') throw new BadRequestException('Echeance deja payee');

    const dueAmount = Number(repayment.amount);
    const moratoire = Number(repayment.moratoireAmount || 0);
    const totalDue = dueAmount + moratoire;

    // Ordre d'imputation : moratoires -> interets -> capital
    let remaining = amount;
    let moratoirePaid = 0;
    let penaltyPaid = 0;

    // 1. Moratoires d'abord
    if (moratoire > 0 && remaining > 0) {
      moratoirePaid = Math.min(remaining, moratoire);
      remaining -= moratoirePaid;
    }

    // 2. Penalite de retard fixe
    const isLate = new Date() > repayment.dueDate;
    if (isLate && remaining > 0) {
      penaltyPaid = Math.round(dueAmount * 0.02);
      remaining -= Math.min(remaining, penaltyPaid);
    }

    // 3. Le reste va au capital + interets (echeance)
    const echeancePaid = Math.min(remaining, dueAmount);
    const isFullyPaid = amount >= totalDue;

    await this.prisma.$transaction(async (tx) => {
      await tx.repayment.update({
        where: { id: repaymentId },
        data: {
          paidAmount: amount,
          penalty: penaltyPaid,
          moratoireAmount: moratoire,
          status: isFullyPaid ? 'PAID' : 'PARTIAL',
          paidAt: isFullyPaid ? new Date() : null,
        },
      });

      if (isFullyPaid) {
        await tx.credit.update({
          where: { id: repayment.creditId },
          data: { remainingAmount: { decrement: dueAmount } },
        });

        // Verifier si tout est rembourse
        const unpaid = await tx.repayment.count({
          where: { creditId: repayment.creditId, status: { not: 'PAID' } },
        });

        if (unpaid === 0) {
          await tx.credit.update({
            where: { id: repayment.creditId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        }
      }
    });

    // Ecriture comptable
    try {
      const agencyId = repayment.credit.client.accounts[0]?.agencyId;
      if (agencyId) {
        const simulation = this.simulate({
          amount: Number(repayment.credit.amount),
          interestRate: Number(repayment.credit.interestRate),
          durationMonths: repayment.credit.durationMonths,
        });
        const paidCount = await this.prisma.repayment.count({
          where: { creditId: repayment.creditId, status: 'PAID' },
        });
        const scheduleRow = simulation.schedule[paidCount - 1] || simulation.schedule[simulation.schedule.length - 1];
        await this.accountingService.recordCreditRepayment(
          agencyId, scheduleRow?.principal || echeancePaid, scheduleRow?.interest || 0, repayment.credit.creditNumber,
        );
      }
    } catch (e) {
      console.error(`[COMPTA] Echec ecriture remboursement:`, e.message);
    }

    if (userId) {
      this.auditService.log({
        userId, action: 'UPDATE', module: 'CREDITS',
        entityId: repayment.creditId, entityType: 'Repayment',
        details: `Remboursement ${amount} FCFA (moratoires: ${moratoirePaid}, penalite: ${penaltyPaid})`,
      }).catch(e => console.error('[AUDIT]', e.message));
    }

    return {
      message: isFullyPaid ? 'Echeance entierement payee' : 'Paiement partiel enregistre',
      moratoirePaid,
      penaltyPaid,
      echeancePaid,
      totalPaid: amount,
      status: isFullyPaid ? 'PAID' : 'PARTIAL',
    };
  }

  // ==================== REMBOURSEMENT ANTICIPE ====================

  async earlyRepayment(creditId: string, amount: number, isTotal: boolean = false, userId?: string) {
    const credit = await this.prisma.credit.findUnique({
      where: { id: creditId },
      include: {
        repayments: { orderBy: { dueDate: 'asc' } },
        client: { include: { accounts: { where: { type: 'CURRENT', status: 'ACTIVE' }, take: 1 } } },
      },
    });

    if (!credit) throw new NotFoundException('Credit non trouve');
    if (!['DISBURSED', 'ACTIVE'].includes(credit.status)) {
      throw new BadRequestException('Le credit doit etre actif pour un remboursement anticipe');
    }

    const unpaidRepayments = credit.repayments.filter(r => r.status !== 'PAID');
    const totalRemaining = unpaidRepayments.reduce((sum, r) => sum + Number(r.amount), 0);

    if (isTotal) {
      // Remboursement total : payer toutes les echeances restantes
      // Rabais : on ne paie que le capital restant (pas les interets futurs)
      const capitalRemaining = Number(credit.remainingAmount) - unpaidRepayments.reduce((sum, r) => {
        const simulation = this.simulate({
          amount: Number(credit.amount),
          interestRate: Number(credit.interestRate),
          durationMonths: credit.durationMonths,
        });
        const idx = credit.repayments.indexOf(r);
        return sum + (simulation.schedule[idx]?.interest || 0);
      }, 0);

      await this.prisma.$transaction(async (tx) => {
        // Marquer toutes les echeances comme payees
        await tx.repayment.updateMany({
          where: { creditId, status: { not: 'PAID' } },
          data: { status: 'PAID', paidAmount: 0, paidAt: new Date() },
        });

        // Cloturer le credit
        await tx.credit.update({
          where: { id: creditId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            remainingAmount: 0,
          },
        });
      });

      if (userId) {
        this.auditService.log({
          userId, action: 'UPDATE', module: 'CREDITS',
          entityId: creditId, entityType: 'Credit',
          details: `Remboursement anticipe TOTAL - ${credit.creditNumber}`,
        }).catch(e => console.error('[AUDIT]', e.message));
      }

      return {
        message: 'Credit rembourse par anticipation (total)',
        creditNumber: credit.creditNumber,
        status: 'COMPLETED',
      };
    }

    // Remboursement partiel : payer les prochaines echeances
    if (amount > totalRemaining) {
      throw new BadRequestException(`Le montant depasse le solde restant (${totalRemaining} FCFA)`);
    }

    let remainingPayment = amount;
    const paidIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const repayment of unpaidRepayments) {
        if (remainingPayment <= 0) break;
        const repAmount = Number(repayment.amount);

        if (remainingPayment >= repAmount) {
          await tx.repayment.update({
            where: { id: repayment.id },
            data: { status: 'PAID', paidAmount: repAmount, paidAt: new Date() },
          });
          paidIds.push(repayment.id);
          remainingPayment -= repAmount;
        } else {
          break; // Ne pas payer partiellement une echeance
        }
      }

      await tx.credit.update({
        where: { id: creditId },
        data: { remainingAmount: { decrement: amount - remainingPayment } },
      });

      // Verifier si tout est rembourse
      const remaining = await tx.repayment.count({
        where: { creditId, status: { not: 'PAID' } },
      });
      if (remaining === 0) {
        await tx.credit.update({
          where: { id: creditId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }
    });

    if (userId) {
      this.auditService.log({
        userId, action: 'UPDATE', module: 'CREDITS',
        entityId: creditId, entityType: 'Credit',
        details: `Remboursement anticipe PARTIEL ${amount} FCFA - ${paidIds.length} echeance(s) soldee(s)`,
      }).catch(e => console.error('[AUDIT]', e.message));
    }

    return {
      message: `Remboursement anticipe partiel : ${paidIds.length} echeance(s) soldee(s)`,
      creditNumber: credit.creditNumber,
      amountApplied: amount - remainingPayment,
      echeancesSoldees: paidIds.length,
    };
  }

  // ==================== RADIATION (WRITE-OFF) ====================

  async writeOff(creditId: string, reason: string, userId?: string) {
    const credit = await this.prisma.credit.findUnique({
      where: { id: creditId },
      include: { repayments: true },
    });

    if (!credit) throw new NotFoundException('Credit non trouve');
    if (!['DISBURSED', 'ACTIVE', 'DEFAULTED'].includes(credit.status)) {
      throw new BadRequestException('Seul un credit actif ou defaillant peut etre radie');
    }

    const unpaidAmount = credit.repayments
      .filter(r => r.status !== 'PAID')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    await this.prisma.$transaction(async (tx) => {
      // Annuler toutes les echeances restantes
      await tx.repayment.updateMany({
        where: { creditId, status: { not: 'PAID' } },
        data: { status: 'WRITTEN_OFF' as any },
      });

      // Marquer le credit comme radie
      await tx.credit.update({
        where: { id: creditId },
        data: {
          status: 'WRITTEN_OFF' as any,
          completedAt: new Date(),
          remainingAmount: 0,
        },
      });
    });

    if (userId) {
      this.auditService.log({
        userId, action: 'UPDATE', module: 'CREDITS',
        entityId: creditId, entityType: 'Credit',
        details: `RADIATION credit ${credit.creditNumber} - Montant radie: ${unpaidAmount} FCFA - Motif: ${reason}`,
      }).catch(e => console.error('[AUDIT]', e.message));
    }

    return {
      message: 'Credit radie (write-off)',
      creditNumber: credit.creditNumber,
      amountWrittenOff: unpaidAmount,
      reason,
    };
  }

  // ==================== TABLEAU DE BORD RECOUVREMENT ====================

  async getRecoveryDashboard() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(now.getDate() - 90);

    // Echeances en retard groupees par classification
    const overdueRepayments = await this.prisma.repayment.findMany({
      where: { status: 'PENDING', dueDate: { lt: now } },
      include: {
        credit: {
          include: {
            client: { select: { id: true, firstName: true, lastName: true, phone: true, clientNumber: true } },
            creditProduct: { select: { name: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const retardSimple: any[] = []; // < 30j
    const preContentieux: any[] = []; // 30-90j
    const contentieux: any[] = []; // > 90j

    let totalOverdue = 0;
    let totalMoratoires = 0;

    for (const r of overdueRepayments) {
      const daysLate = Math.floor((now.getTime() - r.dueDate.getTime()) / (24 * 3600 * 1000));
      const item = {
        repaymentId: r.id,
        creditNumber: r.credit.creditNumber,
        client: r.credit.client,
        productName: r.credit.creditProduct?.name || 'Standard',
        amountDue: Number(r.amount),
        moratoire: Number(r.moratoireAmount || 0),
        totalDue: Number(r.amount) + Number(r.moratoireAmount || 0),
        dueDate: r.dueDate,
        daysLate,
      };

      totalOverdue += item.amountDue;
      totalMoratoires += item.moratoire;

      if (daysLate < 30) retardSimple.push(item);
      else if (daysLate < 90) preContentieux.push(item);
      else contentieux.push(item);
    }

    return {
      summary: {
        totalOverdueCount: overdueRepayments.length,
        totalOverdueAmount: totalOverdue,
        totalMoratoires,
        retardSimple: retardSimple.length,
        preContentieux: preContentieux.length,
        contentieux: contentieux.length,
      },
      retardSimple,
      preContentieux,
      contentieux,
    };
  }
}
