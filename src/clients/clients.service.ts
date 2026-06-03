import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SmsService } from '../sms/sms.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateClientDto, UpdateClientDto, AddMandataireDto } from './dto/client.dto';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private smsService: SmsService,
    private whatsappService: WhatsappService,
  ) {}

  private generateClientNumber(): string {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `CLI-${timestamp}${random}`;
  }

  // ==================== ANTI-DOUBLON ====================

  async checkDuplicate(params: {
    phone?: string;
    idDocumentNumber?: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    numeroEnregistrement?: string;
  }) {
    const conditions: any[] = [];

    if (params.phone) {
      // Nettoyer le telephone (garder uniquement les chiffres)
      const cleanPhone = params.phone.replace(/[^0-9+]/g, '');
      conditions.push({ phone: { contains: cleanPhone.slice(-9) } });
    }

    if (params.idDocumentNumber) {
      conditions.push({ idDocumentNumber: params.idDocumentNumber });
    }

    if (params.numeroEnregistrement) {
      conditions.push({ numeroEnregistrement: params.numeroEnregistrement });
    }

    if (params.firstName && params.lastName) {
      conditions.push({
        AND: [
          { firstName: { contains: params.firstName } },
          { lastName: { contains: params.lastName } },
        ],
      });
    }

    if (conditions.length === 0) {
      return { duplicates: [], hasDuplicates: false };
    }

    const duplicates = await this.prisma.client.findMany({
      where: { OR: conditions },
      select: {
        id: true,
        clientNumber: true,
        clientType: true,
        firstName: true,
        lastName: true,
        raisonSociale: true,
        phone: true,
        idDocumentNumber: true,
        idDocumentType: true,
        numeroEnregistrement: true,
        profilePhoto: true,
        status: true,
        createdAt: true,
      },
      take: 5,
    });

    return {
      duplicates,
      hasDuplicates: duplicates.length > 0,
    };
  }

  // ==================== SCORING KYC ====================

  calculateKycScore(client: any): { score: number; label: string; details: Record<string, number> } {
    const details: Record<string, number> = {};
    let score = 0;

    if (client.clientType === 'PHYSIQUE') {
      // Photo profil (15 pts)
      if (client.profilePhoto) { details['Photo profil'] = 15; score += 15; }
      else { details['Photo profil'] = 0; }

      // Piece d'identite type (10 pts)
      if (client.idDocumentType) { details['Type piece'] = 10; score += 10; }
      else { details['Type piece'] = 0; }

      // Numero piece (10 pts)
      if (client.idDocumentNumber) { details['Numero piece'] = 10; score += 10; }
      else { details['Numero piece'] = 0; }

      // Photo piece (10 pts)
      if (client.idDocumentPhoto) { details['Photo piece'] = 10; score += 10; }
      else { details['Photo piece'] = 0; }

      // Date expiration valide (10 pts)
      if (client.dateExpirationPiece) {
        const expiry = new Date(client.dateExpirationPiece);
        const today = new Date();
        if (expiry > today) { details['Piece non expiree'] = 10; score += 10; }
        else { details['Piece non expiree'] = 0; }
      } else { details['Piece non expiree'] = 0; }

      // Adresse complete (10 pts)
      if (client.address && client.city && client.region) { details['Adresse complete'] = 10; score += 10; }
      else { details['Adresse complete'] = 0; }

      // Signature electronique (10 pts)
      if (client.signatureData) { details['Signature'] = 10; score += 10; }
      else { details['Signature'] = 0; }

      // Profession (5 pts)
      if (client.profession) { details['Profession'] = 5; score += 5; }
      else { details['Profession'] = 0; }

      // Revenu mensuel (5 pts)
      if (client.revenuMensuel) { details['Revenu mensuel'] = 5; score += 5; }
      else { details['Revenu mensuel'] = 0; }

      // Telephone secondaire (5 pts)
      if (client.phoneSecondaire) { details['Tel. secondaire'] = 5; score += 5; }
      else { details['Tel. secondaire'] = 0; }

      // Date de naissance (5 pts)
      if (client.dateOfBirth) { details['Date naissance'] = 5; score += 5; }
      else { details['Date naissance'] = 0; }

      // Genre (5 pts)
      if (client.gender) { details['Genre'] = 5; score += 5; }
      else { details['Genre'] = 0; }
    } else {
      // Personne Morale — scoring adapte
      // Raison sociale (15 pts)
      if (client.raisonSociale) { details['Raison sociale'] = 15; score += 15; }
      else { details['Raison sociale'] = 0; }

      // Forme juridique (15 pts)
      if (client.formeJuridique) { details['Forme juridique'] = 15; score += 15; }
      else { details['Forme juridique'] = 0; }

      // RCCM (15 pts)
      if (client.numeroEnregistrement) { details['N° Enregistrement'] = 15; score += 15; }
      else { details['N° Enregistrement'] = 0; }

      // NIF (10 pts)
      if (client.identifiantFiscal) { details['NIF'] = 10; score += 10; }
      else { details['NIF'] = 0; }

      // Date constitution (10 pts)
      if (client.dateConstitution) { details['Date constitution'] = 10; score += 10; }
      else { details['Date constitution'] = 0; }

      // Adresse complete (15 pts)
      if (client.address && client.city && client.region) { details['Adresse complete'] = 15; score += 15; }
      else { details['Adresse complete'] = 0; }

      // Au moins 1 signataire (20 pts)
      const signataires = client.mandataires?.filter((m: any) => m.isSignataire) || [];
      if (signataires.length > 0) { details['Signataire(s)'] = 20; score += 20; }
      else { details['Signataire(s)'] = 0; }
    }

    let label = 'Insuffisant';
    if (score >= 80) label = 'Excellent';
    else if (score >= 60) label = 'Bon';
    else if (score >= 40) label = 'Moyen';

    return { score, label, details };
  }

  async recalculateKycScore(id: string) {
    const client = await this.findOne(id);
    const { score, label } = this.calculateKycScore(client);

    await this.prisma.client.update({
      where: { id },
      data: { kycScore: score, kycScoreLabel: label },
    });

    return { score, label, details: this.calculateKycScore(client).details };
  }

  async getExpiredDocuments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const aboutToExpire = new Date();
    aboutToExpire.setDate(aboutToExpire.getDate() + 30);

    const [expired, expiringSoon, kycIncomplete] = await Promise.all([
      this.prisma.client.findMany({
        where: {
          clientType: 'PHYSIQUE',
          dateExpirationPiece: { lt: today },
          status: 'ACTIVE',
        },
        select: { id: true, clientNumber: true, firstName: true, lastName: true, phone: true, idDocumentType: true, dateExpirationPiece: true },
        orderBy: { dateExpirationPiece: 'asc' },
      }),
      this.prisma.client.findMany({
        where: {
          clientType: 'PHYSIQUE',
          dateExpirationPiece: { gte: today, lte: aboutToExpire },
          status: 'ACTIVE',
        },
        select: { id: true, clientNumber: true, firstName: true, lastName: true, phone: true, idDocumentType: true, dateExpirationPiece: true },
        orderBy: { dateExpirationPiece: 'asc' },
      }),
      this.prisma.client.findMany({
        where: {
          kycVerified: false,
          status: 'ACTIVE',
        },
        select: { id: true, clientNumber: true, firstName: true, lastName: true, raisonSociale: true, clientType: true, phone: true, kycScore: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      expired: { count: expired.length, clients: expired },
      expiringSoon: { count: expiringSoon.length, clients: expiringSoon },
      kycIncomplete: { count: kycIncomplete.length, clients: kycIncomplete },
    };
  }

  // ==================== VALIDATION FORMAT ====================

  private validatePhoneFormat(phone: string): void {
    // Format camerounais : +237 suivi de 9 chiffres (6xx ou 2xx)
    const cleanPhone = phone.replace(/[\s\-\.]/g, '');
    const regex = /^\+237[62]\d{8}$/;
    if (!regex.test(cleanPhone)) {
      throw new BadRequestException(
        'Format de telephone invalide. Format attendu : +237 6XX XXX XXX ou +237 2XX XXX XXX (9 chiffres apres +237)',
      );
    }
  }

  private validateIdDocumentExpiry(dateExpiration: string): void {
    if (!dateExpiration) return;
    const expiry = new Date(dateExpiration);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiry < today) {
      throw new BadRequestException(
        'La piece d\'identite est expiree. Veuillez fournir une piece d\'identite valide.',
      );
    }
  }

  private validateCNIFormat(idDocumentNumber: string, idDocumentType: string): void {
    if (idDocumentType === 'CNI') {
      // CNI camerounaise = 9 chiffres
      const regex = /^\d{9}$/;
      if (!regex.test(idDocumentNumber)) {
        throw new BadRequestException(
          'Le numero de CNI doit contenir exactement 9 chiffres numeriques.',
        );
      }
    }
  }

  async create(dto: CreateClientDto, userId?: string) {
    // Valider le format du telephone
    this.validatePhoneFormat(dto.phone);

    // Valider la piece d'identite pour PP
    if (dto.clientType === 'PHYSIQUE') {
      if (dto.dateExpirationPiece) {
        this.validateIdDocumentExpiry(dto.dateExpirationPiece);
      }
      if (dto.idDocumentNumber && dto.idDocumentType) {
        this.validateCNIFormat(dto.idDocumentNumber, dto.idDocumentType);
      }
    }

    // Verifier unicite telephone
    const existingPhone = await this.prisma.client.findFirst({
      where: { phone: dto.phone },
    });
    if (existingPhone) {
      throw new ConflictException('Un client avec ce numero de telephone existe deja');
    }

    // Pour personne physique : verifier unicite piece d'identite
    if (dto.clientType === 'PHYSIQUE' && dto.idDocumentNumber) {
      const existingDoc = await this.prisma.client.findFirst({
        where: { idDocumentNumber: dto.idDocumentNumber },
      });
      if (existingDoc) {
        throw new ConflictException('Un client avec ce numero de piece existe deja');
      }
    }

    // Pour personne morale : verifier unicite numero d'enregistrement
    if (dto.clientType === 'MORALE' && dto.numeroEnregistrement) {
      const existingReg = await this.prisma.client.findFirst({
        where: { numeroEnregistrement: dto.numeroEnregistrement },
      });
      if (existingReg) {
        throw new ConflictException('Une personne morale avec ce numero d\'enregistrement existe deja');
      }
    }

    const data: any = {
      clientNumber: this.generateClientNumber(),
      clientType: dto.clientType,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      city: dto.city,
      region: dto.region,
      agencyId: dto.agencyId,
      language: dto.language || 'FR',
      qrCode: uuidv4(),
      signatureData: dto.signatureData,
      signatureData2: dto.signatureData2,
      signatureData3: dto.signatureData3,
    };

    if (dto.clientType === 'PHYSIQUE') {
      Object.assign(data, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        lieuNaissance: dto.lieuNaissance,
        idDocumentType: dto.idDocumentType,
        idDocumentNumber: dto.idDocumentNumber,
        idDocumentPhoto: dto.idDocumentPhoto,
        dateExpirationPiece: dto.dateExpirationPiece ? new Date(dto.dateExpirationPiece) : undefined,
        profilePhoto: dto.profilePhoto,
        isPEP: dto.isPEP || false,
        profession: dto.profession,
        secteurActivite: dto.secteurActivite,
        revenuMensuel: dto.revenuMensuel,
        phoneSecondaire: dto.phoneSecondaire,
        companyId: dto.companyId,
      });
    } else {
      Object.assign(data, {
        raisonSociale: dto.raisonSociale,
        formeJuridique: dto.formeJuridique,
        numeroEnregistrement: dto.numeroEnregistrement,
        identifiantFiscal: dto.identifiantFiscal,
        dateConstitution: dto.dateConstitution ? new Date(dto.dateConstitution) : undefined,
        signatureRule: dto.signatureRule || 'SINGLE',
      });
    }

    // Calculer le score KYC avant creation
    const { score: kycScore, label: kycScoreLabel } = this.calculateKycScore({ ...data, clientType: dto.clientType, mandataires: [] });
    data.kycScore = kycScore;
    data.kycScoreLabel = kycScoreLabel;

    const client = await this.prisma.client.create({
      data,
      include: { agency: true },
    });

    if (userId) {
      const label = dto.clientType === 'PHYSIQUE' ? `${dto.firstName} ${dto.lastName}` : dto.raisonSociale;
      this.auditService.log({ userId, action: 'CREATE', module: 'CLIENTS', entityId: client.id, entityType: 'Client', details: `Creation client ${dto.clientType} : ${label} (${client.clientNumber})` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    // Generer un mot de passe aleatoire, le hasher, et envoyer par SMS
    const rawPassword = this.generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    await this.prisma.client.update({
      where: { id: client.id },
      data: { password: hashedPassword },
    });

    const clientName = dto.clientType === 'PHYSIQUE'
      ? `${dto.firstName} ${dto.lastName}`
      : dto.raisonSociale || '';
    // Envoyer identifiants par SMS et WhatsApp en parallele
    this.smsService.sendCredentials(dto.phone, clientName, client.clientNumber, rawPassword)
      .catch((e) => console.error('[SMS]', e.message));
    this.whatsappService.sendCredentials(dto.phone, clientName, client.clientNumber, rawPassword)
      .catch((e) => console.error('[WA]', e.message));

    return client;
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Activer / reinitialiser l'acces mobile d'un client
   * Genere un nouveau mot de passe temporaire et l'envoie par SMS
   */
  async activateMobileAccess(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client non trouve');

    const rawPassword = this.generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    await this.prisma.client.update({
      where: { id: clientId },
      data: { password: hashedPassword },
    });

    const clientName = client.clientType === 'PHYSIQUE'
      ? `${client.firstName || ''} ${client.lastName || ''}`.trim()
      : client.raisonSociale || '';

    // Envoyer sur SMS et WhatsApp en parallele
    const [smsSent, waSent] = await Promise.allSettled([
      this.smsService.sendCredentials(client.phone, clientName, client.clientNumber, rawPassword),
      this.whatsappService.sendCredentials(client.phone, clientName, client.clientNumber, rawPassword),
    ]);

    const channels: string[] = [];
    if ((smsSent as PromiseFulfilledResult<boolean>).value) channels.push('SMS');
    if ((waSent as PromiseFulfilledResult<boolean>).value) channels.push('WhatsApp');

    return {
      success: true,
      message: `Acces mobile active. Message envoye via : ${channels.join(' + ') || 'aucun canal (verifiez la configuration)'}`,
      clientNumber: client.clientNumber,
      phone: client.phone,
    };
  }

  async findAll(params: {
    agencyId?: string;
    status?: string;
    search?: string;
    clientType?: string;
    page?: number;
    limit?: number;
  }) {
    const { agencyId, status, search, clientType, page = 1, limit = 20 } = params;

    const where: any = {};
    if (agencyId) where.agencyId = agencyId;
    if (status) where.status = status;
    if (clientType) where.clientType = clientType;
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { raisonSociale: { contains: search } },
        { phone: { contains: search } },
        { clientNumber: { contains: search } },
        { idDocumentNumber: { contains: search } },
        { numeroEnregistrement: { contains: search } },
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        include: { agency: true, accounts: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data: clients,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        agency: true,
        accounts: true,
        credits: true,
        savingsAccounts: {
          include: { product: true },
        },
        company: true,
        mandataires: {
          include: {
            clientPhysique: {
              select: {
                id: true,
                clientNumber: true,
                firstName: true,
                lastName: true,
                phone: true,
                idDocumentType: true,
                idDocumentNumber: true,
                profilePhoto: true,
              },
            },
          },
        },
        mandatairesDe: {
          include: {
            clientMorale: {
              select: {
                id: true,
                clientNumber: true,
                raisonSociale: true,
                formeJuridique: true,
              },
            },
          },
        },
      },
    });

    if (!client) throw new NotFoundException('Client non trouve');
    return client;
  }

  async update(id: string, dto: UpdateClientDto, userId?: string) {
    const existing = await this.findOne(id);
    const data: any = { ...dto };
    if (dto.dateOfBirth) data.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.dateExpirationPiece) data.dateExpirationPiece = new Date(dto.dateExpirationPiece);
    if (dto.dateConstitution) data.dateConstitution = new Date(dto.dateConstitution);

    const result = await this.prisma.client.update({
      where: { id },
      data,
      include: { agency: true, accounts: true },
    });

    // Recalculer le score KYC apres modification
    this.recalculateKycScore(id).catch((e) => console.error('[KYC_SCORE]', e.message));

    if (userId) {
      const fields = Object.keys(dto).join(', ');
      this.auditService.log({ userId, action: 'UPDATE', module: 'CLIENTS', entityId: id, entityType: 'Client', details: `Modification client ${existing.clientNumber} : ${fields}` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return result;
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED', userId?: string) {
    const existing = await this.findOne(id);
    const result = await this.prisma.client.update({
      where: { id },
      data: { status },
    });

    if (userId) {
      this.auditService.log({ userId, action: 'UPDATE', module: 'CLIENTS', entityId: id, entityType: 'Client', details: `Statut client ${existing.clientNumber} : ${existing.status} -> ${status}` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return result;
  }

  async verifyKyc(id: string, userId?: string) {
    const existing = await this.findOne(id);
    const result = await this.prisma.client.update({
      where: { id },
      data: { kycVerified: true },
    });

    if (userId) {
      this.auditService.log({ userId, action: 'UPDATE', module: 'CLIENTS', entityId: id, entityType: 'Client', details: `KYC valide pour client ${existing.clientNumber}` }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return result;
  }

  async exportAll(params: { status?: string; agencyId?: string; clientType?: string }) {
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.agencyId) where.agencyId = params.agencyId;
    if (params.clientType) where.clientType = params.clientType;

    return this.prisma.client.findMany({
      where,
      include: { agency: true, accounts: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==================== MANDATAIRES ====================

  async addMandataire(clientMoraleId: string, dto: AddMandataireDto, userId?: string) {
    const morale = await this.prisma.client.findUnique({ where: { id: clientMoraleId } });
    if (!morale) throw new NotFoundException('Client personne morale non trouve');
    if (morale.clientType !== 'MORALE') {
      throw new BadRequestException('Ce client n\'est pas une personne morale');
    }

    const physique = await this.prisma.client.findUnique({ where: { id: dto.clientPhysiqueId } });
    if (!physique) throw new NotFoundException('Client personne physique non trouve');
    if (physique.clientType !== 'PHYSIQUE') {
      throw new BadRequestException('Le mandataire doit etre une personne physique');
    }

    const existing = await this.prisma.mandataire.findUnique({
      where: {
        clientMoraleId_clientPhysiqueId: {
          clientMoraleId,
          clientPhysiqueId: dto.clientPhysiqueId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('Ce mandataire est deja lie a cette personne morale');
    }

    const mandataire = await this.prisma.mandataire.create({
      data: {
        clientMoraleId,
        clientPhysiqueId: dto.clientPhysiqueId,
        role: dto.role,
        isSignataire: dto.isSignataire || false,
        maxOperationAmount: dto.maxOperationAmount,
        signatureUrl: dto.signatureUrl,
        documentUrl: dto.documentUrl,
      },
      include: {
        clientPhysique: {
          select: {
            id: true,
            clientNumber: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    // Audit : historique ajout mandataire
    if (userId) {
      this.auditService.log({
        userId,
        action: 'CREATE',
        module: 'MANDATAIRES',
        entityId: mandataire.id,
        entityType: 'Mandataire',
        details: `Ajout mandataire ${physique.firstName} ${physique.lastName} (${dto.role}) a ${morale.raisonSociale}`,
        newValues: { clientMoraleId, clientPhysiqueId: dto.clientPhysiqueId, role: dto.role, isSignataire: dto.isSignataire, maxOperationAmount: dto.maxOperationAmount },
      }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return mandataire;
  }

  async getMandataires(clientMoraleId: string) {
    return this.prisma.mandataire.findMany({
      where: { clientMoraleId },
      include: {
        clientPhysique: {
          select: {
            id: true,
            clientNumber: true,
            firstName: true,
            lastName: true,
            phone: true,
            idDocumentType: true,
            idDocumentNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateMandataire(id: string, data: Partial<AddMandataireDto>, userId?: string) {
    const mandataire = await this.prisma.mandataire.findUnique({
      where: { id },
      include: { clientPhysique: { select: { firstName: true, lastName: true } }, clientMorale: { select: { raisonSociale: true } } },
    });
    if (!mandataire) throw new NotFoundException('Mandataire non trouve');

    const oldValues = { role: mandataire.role, isSignataire: mandataire.isSignataire, maxOperationAmount: (mandataire as any).maxOperationAmount };

    const updated = await this.prisma.mandataire.update({
      where: { id },
      data: {
        role: data.role,
        isSignataire: data.isSignataire,
        maxOperationAmount: data.maxOperationAmount,
        signatureUrl: data.signatureUrl,
        documentUrl: data.documentUrl,
      },
      include: {
        clientPhysique: {
          select: {
            id: true,
            clientNumber: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    // Audit : historique modification mandataire
    if (userId) {
      this.auditService.log({
        userId,
        action: 'UPDATE',
        module: 'MANDATAIRES',
        entityId: id,
        entityType: 'Mandataire',
        details: `Modification mandataire ${mandataire.clientPhysique.firstName} ${mandataire.clientPhysique.lastName} de ${mandataire.clientMorale.raisonSociale}`,
        oldValues,
        newValues: { role: data.role, isSignataire: data.isSignataire, maxOperationAmount: data.maxOperationAmount },
      }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return updated;
  }

  async removeMandataire(id: string, userId?: string) {
    const mandataire = await this.prisma.mandataire.findUnique({
      where: { id },
      include: { clientPhysique: { select: { firstName: true, lastName: true } }, clientMorale: { select: { raisonSociale: true } } },
    });
    if (!mandataire) throw new NotFoundException('Mandataire non trouve');

    const result = await this.prisma.mandataire.delete({ where: { id } });

    // Audit : historique suppression mandataire
    if (userId) {
      this.auditService.log({
        userId,
        action: 'DELETE',
        module: 'MANDATAIRES',
        entityId: id,
        entityType: 'Mandataire',
        details: `Suppression mandataire ${mandataire.clientPhysique.firstName} ${mandataire.clientPhysique.lastName} de ${mandataire.clientMorale.raisonSociale}`,
        oldValues: { role: mandataire.role, isSignataire: mandataire.isSignataire },
      }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return result;
  }

  // ==================== IMPORT CLIENTS CSV ====================

  async importClients(rows: any[], userId?: string) {
    const results = { success: 0, errors: [] as { row: number; error: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const dto: any = {
          clientType: (row.clientType || row.type || 'PHYSIQUE').toUpperCase(),
          phone: row.phone || row.telephone,
          address: row.address || row.adresse || '-',
          city: row.city || row.ville || '-',
          region: row.region || '-',
        };

        if (dto.clientType === 'PHYSIQUE') {
          dto.firstName = row.firstName || row.prenom || row.nom;
          dto.lastName = row.lastName || row.nom_famille || row.nom;
          dto.gender = row.gender || row.genre;
          dto.dateOfBirth = row.dateOfBirth || row.date_naissance;
          dto.idDocumentType = row.idDocumentType || row.type_piece;
          dto.idDocumentNumber = row.idDocumentNumber || row.numero_piece;
          dto.profession = row.profession;
          dto.email = row.email;
        } else {
          dto.raisonSociale = row.raisonSociale || row.raison_sociale;
          dto.formeJuridique = row.formeJuridique || row.forme_juridique;
          dto.numeroEnregistrement = row.numeroEnregistrement || row.numero_enregistrement || row.rccm;
          dto.identifiantFiscal = row.identifiantFiscal || row.nif;
        }

        if (!dto.phone) {
          results.errors.push({ row: i + 2, error: 'Telephone manquant' });
          continue;
        }

        // Verifier doublon telephone
        const existingPhone = await this.prisma.client.findFirst({ where: { phone: dto.phone } });
        if (existingPhone) {
          results.errors.push({ row: i + 2, error: `Telephone ${dto.phone} deja existant (${existingPhone.clientNumber})` });
          continue;
        }

        const data: any = {
          clientNumber: this.generateClientNumber(),
          clientType: dto.clientType,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          city: dto.city,
          region: dto.region,
          language: 'FR',
          qrCode: uuidv4(),
        };

        if (dto.clientType === 'PHYSIQUE') {
          Object.assign(data, {
            firstName: dto.firstName,
            lastName: dto.lastName,
            gender: dto.gender,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
            idDocumentType: dto.idDocumentType,
            idDocumentNumber: dto.idDocumentNumber,
            profession: dto.profession,
          });
        } else {
          Object.assign(data, {
            raisonSociale: dto.raisonSociale,
            formeJuridique: dto.formeJuridique,
            numeroEnregistrement: dto.numeroEnregistrement,
            identifiantFiscal: dto.identifiantFiscal,
            signatureRule: 'SINGLE',
          });
        }

        const { score: kycScore, label: kycScoreLabel } = this.calculateKycScore({ ...data, mandataires: [] });
        data.kycScore = kycScore;
        data.kycScoreLabel = kycScoreLabel;

        await this.prisma.client.create({ data });
        results.success++;
      } catch (e: any) {
        results.errors.push({ row: i + 2, error: e.message || 'Erreur inconnue' });
      }
    }

    if (userId) {
      this.auditService.log({
        userId,
        action: 'IMPORT',
        module: 'CLIENTS',
        entityType: 'Client',
        details: `Import CSV : ${results.success} clients importes, ${results.errors.length} erreurs`,
      }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return results;
  }

  // ==================== FUSION DE DOUBLONS ====================

  async mergeClients(primaryId: string, secondaryId: string, userId?: string) {
    if (primaryId === secondaryId) {
      throw new BadRequestException('Impossible de fusionner un client avec lui-meme');
    }

    const primary = await this.findOne(primaryId);
    const secondary = await this.findOne(secondaryId);

    if (primary.clientType !== secondary.clientType) {
      throw new BadRequestException('Impossible de fusionner une personne physique avec une personne morale');
    }

    // Transferer les comptes du secondaire vers le primaire
    await this.prisma.account.updateMany({
      where: { clientId: secondaryId },
      data: { clientId: primaryId },
    });

    // Transferer les credits
    await this.prisma.credit.updateMany({
      where: { clientId: secondaryId },
      data: { clientId: primaryId },
    });

    // Transferer les comptes epargne
    await this.prisma.savingsAccount.updateMany({
      where: { clientId: secondaryId },
      data: { clientId: primaryId },
    });

    // Si PM : transferer les mandataires (ignorer les doublons)
    if (primary.clientType === 'MORALE') {
      const secondaryMandataires = await this.prisma.mandataire.findMany({
        where: { clientMoraleId: secondaryId },
      });
      for (const m of secondaryMandataires) {
        const exists = await this.prisma.mandataire.findUnique({
          where: { clientMoraleId_clientPhysiqueId: { clientMoraleId: primaryId, clientPhysiqueId: m.clientPhysiqueId } },
        });
        if (!exists) {
          await this.prisma.mandataire.update({
            where: { id: m.id },
            data: { clientMoraleId: primaryId },
          });
        } else {
          await this.prisma.mandataire.delete({ where: { id: m.id } });
        }
      }
    }

    // Enrichir le primaire avec les champs manquants du secondaire
    const fieldsToMerge: Record<string, any> = {};
    const mergeableFields = ['email', 'profilePhoto', 'idDocumentPhoto', 'signatureData', 'signatureData2', 'signatureData3', 'profession', 'secteurActivite', 'revenuMensuel', 'phoneSecondaire', 'dateExpirationPiece', 'identifiantFiscal'];
    for (const field of mergeableFields) {
      if (!(primary as any)[field] && (secondary as any)[field]) {
        fieldsToMerge[field] = (secondary as any)[field];
      }
    }
    if (Object.keys(fieldsToMerge).length > 0) {
      await this.prisma.client.update({ where: { id: primaryId }, data: fieldsToMerge });
    }

    // Supprimer le client secondaire
    await this.prisma.client.delete({ where: { id: secondaryId } });

    // Recalculer le KYC du client primaire
    this.recalculateKycScore(primaryId).catch((e) => console.error('[KYC_SCORE]', e.message));

    // Audit
    if (userId) {
      const primaryLabel = primary.clientType === 'PHYSIQUE' ? `${primary.firstName} ${primary.lastName}` : primary.raisonSociale;
      const secondaryLabel = secondary.clientType === 'PHYSIQUE' ? `${secondary.firstName} ${secondary.lastName}` : secondary.raisonSociale;
      this.auditService.log({
        userId,
        action: 'MERGE',
        module: 'CLIENTS',
        entityId: primaryId,
        entityType: 'Client',
        details: `Fusion : ${secondaryLabel} (${secondary.clientNumber}) absorbe par ${primaryLabel} (${primary.clientNumber})`,
        oldValues: { secondaryId, secondaryNumber: secondary.clientNumber },
        newValues: { primaryId, mergedFields: Object.keys(fieldsToMerge), accountsTransferred: secondary.accounts?.length || 0 },
      }).catch((e) => console.error('[AUDIT]', e.message));
    }

    return this.findOne(primaryId);
  }
}
