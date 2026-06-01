import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChequeStatus } from '@prisma/client';
import {
  RequestCheckbookDto,
  EmitChequeDto,
  OppositionChequeDto,
  EncaisserChequeDto,
  RetraitChequeDto,
} from './dto/checkbook.dto';

@Injectable()
export class CheckbooksService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Recuperer les infos du compte, client et chequiers actifs pour verification cheque
   */
  async getAccountInfo(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            idDocumentType: true,
            idDocumentNumber: true,
            profilePhoto: true,
            signatureData: true,
            signatureData2: true,
            signatureData3: true,
            clientType: true,
            raisonSociale: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Compte introuvable');
    }

    // Recuperer les chequiers actifs avec les cheques emis
    const checkbooks = await this.prisma.checkbook.findMany({
      where: {
        accountId,
        status: 'ACTIVE',
      },
      include: {
        cheques: {
          where: { status: 'EMIS' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        type: account.type,
        balance: account.balance,
        status: account.status,
      },
      client: account.client,
      checkbooks,
    };
  }

  /**
   * Rechercher un cheque par son numero et retourner toutes les infos
   */
  async findChequeByNumber(chequeNumber: string) {
    const cheque = await this.prisma.cheque.findFirst({
      where: { chequeNumber },
      include: {
        checkbook: {
          include: {
            account: {
              include: {
                client: {
                  select: {
                    id: true,
                    clientNumber: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    email: true,
                    address: true,
                    city: true,
                    idDocumentType: true,
                    idDocumentNumber: true,
                    profilePhoto: true,
                    signatureData: true,
                    signatureData2: true,
                    signatureData3: true,
                    clientType: true,
                    raisonSociale: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cheque) {
      throw new NotFoundException(`Cheque ${chequeNumber} introuvable`);
    }

    return {
      cheque: {
        id: cheque.id,
        chequeNumber: cheque.chequeNumber,
        status: cheque.status,
        amount: cheque.amount,
        beneficiary: cheque.beneficiary,
        emittedAt: cheque.emittedAt,
      },
      account: {
        id: cheque.checkbook.account.id,
        accountNumber: cheque.checkbook.account.accountNumber,
        type: cheque.checkbook.account.type,
        balance: cheque.checkbook.account.balance,
        status: cheque.checkbook.account.status,
      },
      client: cheque.checkbook.account.client,
    };
  }

  /**
   * Demander un nouveau chequier
   */
  async requestCheckbook(dto: RequestCheckbookDto, userId?: string) {
    // Verifier que le compte existe et est actif
    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
    });
    if (!account) {
      throw new NotFoundException('Compte introuvable');
    }
    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Le compte doit etre actif pour demander un chequier');
    }

    // Verifier qu'il n'y a pas deja un chequier actif
    const activeCheckbook = await this.prisma.checkbook.findFirst({
      where: {
        accountId: dto.accountId,
        status: 'ACTIVE',
      },
      include: {
        cheques: { where: { status: ChequeStatus.DISPONIBLE } },
      },
    });
    if (activeCheckbook && activeCheckbook.cheques.length > 0) {
      throw new BadRequestException(
        `Un chequier actif existe deja pour ce compte (serie CHQ-${String(activeCheckbook.seriesStart).padStart(6, '0')} a CHQ-${String(activeCheckbook.seriesEnd).padStart(6, '0')}, ${activeCheckbook.cheques.length} cheque(s) disponible(s)). Terminez-le ou declarez-le en opposition avant d'en demander un nouveau.`,
      );
    }

    // Determiner le debut de la serie
    const lastCheckbook = await this.prisma.checkbook.findFirst({
      where: { accountId: dto.accountId },
      orderBy: { seriesEnd: 'desc' },
    });
    const seriesStart = lastCheckbook ? lastCheckbook.seriesEnd + 1 : 1;
    const seriesEnd = seriesStart + dto.totalLeaves - 1;

    // Creer le chequier et tous les cheques individuels
    const checkbook = await this.prisma.checkbook.create({
      data: {
        accountId: dto.accountId,
        seriesStart,
        seriesEnd,
        totalLeaves: dto.totalLeaves,
        status: 'ACTIVE',
        cheques: {
          create: Array.from({ length: dto.totalLeaves }, (_, i) => ({
            chequeNumber: `CHQ-${String(seriesStart + i).padStart(6, '0')}`,
            status: ChequeStatus.DISPONIBLE,
          })),
        },
      },
      include: {
        cheques: true,
      },
    });

    // Audit
    if (userId) {
      await this.audit.log({
        userId,
        action: 'CREATE_CHECKBOOK',
        module: 'CHECKBOOKS',
        entityId: checkbook.id,
        entityType: 'Checkbook',
        newValues: {
          accountId: dto.accountId,
          totalLeaves: dto.totalLeaves,
          seriesStart,
          seriesEnd,
        },
      });
    }

    return checkbook;
  }

  /**
   * Lister les chequiers d'un compte avec decompte par statut
   */
  async getCheckbooks(accountId: string) {
    const checkbooks = await this.prisma.checkbook.findMany({
      where: { accountId },
      include: {
        cheques: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return checkbooks.map((cb) => {
      const statusCounts = {
        DISPONIBLE: 0,
        EMIS: 0,
        ENCAISSE: 0,
        OPPOSITION: 0,
      };
      cb.cheques.forEach((c) => {
        statusCounts[c.status]++;
      });

      const { cheques, ...rest } = cb;
      return {
        ...rest,
        chequeCounts: statusCounts,
        totalCheques: cheques.length,
      };
    });
  }

  /**
   * Liste paginee des cheques
   */
  async getCheques(params: {
    checkbookId?: string;
    accountId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { checkbookId, accountId, status, page = 1, limit = 20 } = params;
    const where: any = {};

    if (checkbookId) {
      where.checkbookId = checkbookId;
    }
    if (accountId) {
      where.checkbook = { accountId };
    }
    if (status) {
      where.status = status as ChequeStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.cheque.findMany({
        where,
        include: {
          checkbook: {
            select: {
              id: true,
              accountId: true,
              seriesStart: true,
              seriesEnd: true,
              status: true,
            },
          },
        },
        orderBy: { chequeNumber: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cheque.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Emettre un cheque
   */
  async emitCheque(chequeId: string, dto: EmitChequeDto, userId?: string) {
    const cheque = await this.prisma.cheque.findUnique({
      where: { id: chequeId },
    });
    if (!cheque) {
      throw new NotFoundException('Cheque introuvable');
    }
    if (cheque.status !== ChequeStatus.DISPONIBLE) {
      throw new BadRequestException(
        `Le cheque ne peut pas etre emis : statut actuel "${cheque.status}"`,
      );
    }

    const updated = await this.prisma.cheque.update({
      where: { id: chequeId },
      data: {
        status: ChequeStatus.EMIS,
        amount: dto.amount,
        beneficiary: dto.beneficiary,
        emittedAt: new Date(),
      },
    });

    if (userId) {
      await this.audit.log({
        userId,
        action: 'EMIT_CHEQUE',
        module: 'CHECKBOOKS',
        entityId: chequeId,
        entityType: 'Cheque',
        newValues: {
          chequeNumber: dto.chequeNumber,
          amount: dto.amount,
          beneficiary: dto.beneficiary,
        },
      });
    }

    return updated;
  }

  /**
   * Encaisser un cheque — virement vers un autre compte OU retrait especes
   * Si dto.accountId est fourni : virement (debit emetteur + credit destinataire)
   * Si dto.accountId est absent : retrait especes (debit emetteur uniquement)
   */
  async encaisserCheque(chequeId: string, dto: EncaisserChequeDto, userId?: string) {
    const cheque = await this.prisma.cheque.findUnique({
      where: { id: chequeId },
      include: {
        checkbook: {
          include: {
            account: {
              include: {
                client: { select: { id: true, firstName: true, lastName: true, raisonSociale: true } },
              },
            },
          },
        },
      },
    });

    if (!cheque) {
      throw new NotFoundException('Cheque introuvable');
    }

    if (cheque.status === ChequeStatus.OPPOSITION) {
      throw new ForbiddenException('Transaction refusee : Cheque declare vole/perdu');
    }

    if (cheque.status !== ChequeStatus.EMIS) {
      throw new BadRequestException(
        `Le cheque ne peut pas etre encaisse : statut actuel "${cheque.status}"`,
      );
    }

    const amount = Number(cheque.amount);
    if (!amount || amount <= 0) {
      throw new BadRequestException('Montant du cheque invalide');
    }

    const sourceAccount = cheque.checkbook.account;
    if (amount > Number(sourceAccount.balance)) {
      throw new BadRequestException(
        `Provision insuffisante. Solde : ${Number(sourceAccount.balance).toLocaleString('fr-FR')} FCFA, Montant cheque : ${amount.toLocaleString('fr-FR')} FCFA`,
      );
    }

    const isRetrait = !dto.accountId;
    const reference = `CHQ-${cheque.chequeNumber}-${Date.now()}`;

    // Tout dans une transaction Prisma atomique
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mettre a jour le statut du cheque
      const updatedCheque = await tx.cheque.update({
        where: { id: chequeId },
        data: {
          status: ChequeStatus.ENCAISSE,
          encaisseAt: new Date(),
        },
      });

      // 2. Debiter le compte emetteur
      await tx.account.update({
        where: { id: sourceAccount.id },
        data: { balance: { decrement: amount } },
      });

      // 3. Creer la transaction (retrait ou virement)
      if (isRetrait) {
        // Retrait especes par cheque
        const debitTransaction = await tx.transaction.create({
          data: {
            fromAccountId: sourceAccount.id,
            type: 'WITHDRAWAL',
            amount,
            reference,
            description: `Retrait par cheque ${cheque.chequeNumber} - ${cheque.beneficiary}`,
            status: 'COMPLETED',
            agencyId: sourceAccount.agencyId,
          },
        });
        return { cheque: updatedCheque, transaction: debitTransaction };
      } else {
        // Virement par cheque : crediter le compte destinataire
        const destAccount = await tx.account.findUnique({
          where: { id: dto.accountId },
        });
        if (!destAccount) {
          throw new NotFoundException('Compte destinataire introuvable');
        }
        if (destAccount.status !== 'ACTIVE') {
          throw new BadRequestException('Le compte destinataire n\'est pas actif');
        }

        await tx.account.update({
          where: { id: dto.accountId },
          data: { balance: { increment: amount } },
        });

        const transferTransaction = await tx.transaction.create({
          data: {
            fromAccountId: sourceAccount.id,
            toAccountId: dto.accountId,
            type: 'TRANSFER',
            amount,
            reference,
            description: `Virement par cheque ${cheque.chequeNumber} de ${sourceAccount.client?.firstName || ''} ${sourceAccount.client?.lastName || sourceAccount.client?.raisonSociale || ''} vers ${cheque.beneficiary}`,
            status: 'COMPLETED',
            agencyId: sourceAccount.agencyId,
          },
        });
        return { cheque: updatedCheque, transaction: transferTransaction };
      }
    });

    // Audit
    if (userId) {
      await this.audit.log({
        userId,
        action: isRetrait ? 'RETRAIT_CHEQUE' : 'ENCAISSER_CHEQUE',
        module: 'CHECKBOOKS',
        entityId: chequeId,
        entityType: 'Cheque',
        newValues: {
          chequeNumber: cheque.chequeNumber,
          amount,
          beneficiary: cheque.beneficiary,
          type: isRetrait ? 'RETRAIT_ESPECES' : 'VIREMENT',
          destinationAccountId: dto.accountId || null,
          reference,
        },
      });
    }

    return result;
  }

  /**
   * Mettre un cheque en opposition
   */
  async opposeCheque(chequeId: string, dto: OppositionChequeDto, userId?: string) {
    const cheque = await this.prisma.cheque.findUnique({
      where: { id: chequeId },
    });
    if (!cheque) {
      throw new NotFoundException('Cheque introuvable');
    }
    if (
      cheque.status === ChequeStatus.OPPOSITION ||
      cheque.status === ChequeStatus.ENCAISSE
    ) {
      throw new BadRequestException(
        `Impossible de mettre en opposition : statut actuel "${cheque.status}"`,
      );
    }

    const updated = await this.prisma.cheque.update({
      where: { id: chequeId },
      data: {
        status: ChequeStatus.OPPOSITION,
        oppositionAt: new Date(),
        oppositionMotif: dto.motif,
      },
    });

    if (userId) {
      await this.audit.log({
        userId,
        action: 'OPPOSE_CHEQUE',
        module: 'CHECKBOOKS',
        entityId: chequeId,
        entityType: 'Cheque',
        newValues: {
          chequeNumber: cheque.chequeNumber,
          motif: dto.motif,
        },
      });
    }

    return updated;
  }

  /**
   * Mettre tous les cheques d'un chequier en opposition
   */
  async opposeCheckbook(checkbookId: string, motif: string, userId?: string) {
    const checkbook = await this.prisma.checkbook.findUnique({
      where: { id: checkbookId },
      include: { cheques: true },
    });
    if (!checkbook) {
      throw new NotFoundException('Chequier introuvable');
    }

    const eligibleStatuses = [ChequeStatus.DISPONIBLE, ChequeStatus.EMIS];
    const result = await this.prisma.cheque.updateMany({
      where: {
        checkbookId,
        status: { in: eligibleStatuses },
      },
      data: {
        status: ChequeStatus.OPPOSITION,
        oppositionAt: new Date(),
        oppositionMotif: motif,
      },
    });

    if (userId) {
      await this.audit.log({
        userId,
        action: 'OPPOSE_CHECKBOOK',
        module: 'CHECKBOOKS',
        entityId: checkbookId,
        entityType: 'Checkbook',
        newValues: {
          motif,
          chequesAffected: result.count,
        },
      });
    }

    return {
      checkbookId,
      chequesAffected: result.count,
      motif,
    };
  }

  /**
   * Registre des cheques (avec filtres et pagination)
   */
  async getRegistre(params: {
    accountId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { accountId, status, startDate, endDate, page = 1, limit = 20 } = params;
    const where: any = {};

    if (accountId) {
      where.checkbook = { accountId };
    }
    if (status) {
      where.status = status as ChequeStatus;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.cheque.findMany({
        where,
        include: {
          checkbook: {
            include: {
              account: {
                select: {
                  id: true,
                  accountNumber: true,
                  clientId: true,
                  client: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      raisonSociale: true,
                      clientNumber: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cheque.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
