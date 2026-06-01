import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    description?: string;
    maxTransactionAmount?: number;
    sessionTimeout?: number;
    permissionIds?: string[];
  }) {
    const existing = await this.prisma.role.findUnique({
      where: { name: data.name },
    });
    if (existing) throw new ConflictException('Ce role existe deja');

    const { permissionIds, ...roleData } = data;

    const role = await this.prisma.role.create({
      data: roleData,
    });

    if (permissionIds?.length) {
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    return this.findOne(role.id);
  }

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException('Role non trouve');
    return role;
  }

  async updatePermissions(roleId: string, permissionIds: string[]) {
    await this.findOne(roleId);

    // Supprimer les anciennes permissions
    await this.prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    // Ajouter les nouvelles
    await this.prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId,
        permissionId,
      })),
    });

    return this.findOne(roleId);
  }

  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  /**
   * Helper : upsert un role et affecter ses permissions
   */
  private async upsertRoleWithPermissions(
    roleData: { name: string; description: string; isSystem?: boolean; maxTransactionAmount?: number; sessionTimeout?: number },
    permissionFilter: (p: { module: string; action: string }) => boolean,
    allPermissions: { id: string; module: string; action: string }[],
  ) {
    const role = await this.prisma.role.upsert({
      where: { name: roleData.name },
      update: { description: roleData.description },
      create: { ...roleData, isSystem: roleData.isSystem ?? true },
    });
    const perms = allPermissions.filter(permissionFilter);
    await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (perms.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
    return role;
  }

  async seedDefaultRolesAndPermissions() {
    const modules = [
      'CLIENTS',
      'ACCOUNTS',
      'TRANSACTIONS',
      'CREDITS',
      'CONTRIBUTIONS',
      'COMPANIES',
      'ACCOUNTING',
      'REPORTS',
      'AGENCIES',
      'USERS',
      'ROLES',
      'SETTINGS',
      'AUDIT',
    ];
    const actions = ['CREATE', 'READ', 'UPDATE', 'DELETE'];

    // Creer les permissions
    for (const module of modules) {
      for (const action of actions) {
        await this.prisma.permission.upsert({
          where: { module_action: { module, action } },
          update: {},
          create: {
            module,
            action,
            description: `${action} ${module}`,
          },
        });
      }
    }

    const allPermissions = await this.prisma.permission.findMany();

    // ================================================================
    // 1. ADMINISTRATEUR SYSTEME (Super-User)
    // Ne manipule pas d'argent, ne cree pas de clients. Configure le logiciel.
    // Permissions : creation comptes employes, parametrage taux, produits,
    // permissions, audit, sauvegardes.
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'SUPER_ADMIN',
        description: 'Administrateur systeme : parametrage, comptes employes, audit, sauvegardes. Ne manipule pas d\'argent.',
        sessionTimeout: 60,
      },
      () => true, // toutes les permissions
      allPermissions,
    );

    // ================================================================
    // 2. AGENT D'ACCUEIL / CHARGE DE CLIENTELE (Front Desk)
    // Premier point de contact. Ne touche pas aux transactions financieres.
    // Permissions : creation/modif fiches clients (PP + PM), KYC,
    // initiation demandes ouverture comptes, edition cartes membres.
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'AGENT_ACCUEIL',
        description: 'Agent d\'accueil / Charge de clientele : creation fiches clients, KYC, demandes ouverture comptes. Pas de transactions financieres.',
        sessionTimeout: 30,
      },
      (p) =>
        (p.module === 'CLIENTS' && ['CREATE', 'READ', 'UPDATE'].includes(p.action)) ||
        (p.module === 'ACCOUNTS' && ['CREATE', 'READ'].includes(p.action)) ||
        (p.module === 'COMPANIES' && ['READ'].includes(p.action)),
      allPermissions,
    );

    // ================================================================
    // 3. CAISSIERE / CAISSIER (Guichet)
    // Poste le plus expose aux risques financiers. Droits limites au flux d'argent.
    // Permissions : ouverture/fermeture caisse, depots, retraits,
    // encaissement frais, remboursements credits, decaissement prets approuves.
    // Restrictions : impossible de modifier profil client, valider credit, acceder comptabilite.
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'CAISSIER',
        description: 'Caissier(e) guichet : depots, retraits, encaissement frais, remboursements credits, ouverture/fermeture caisse. Pas de modif client ni comptabilite.',
        maxTransactionAmount: 500000,
        sessionTimeout: 15,
      },
      (p) =>
        (p.module === 'CLIENTS' && p.action === 'READ') ||
        (p.module === 'ACCOUNTS' && p.action === 'READ') ||
        (p.module === 'TRANSACTIONS' && ['CREATE', 'READ'].includes(p.action)) ||
        (p.module === 'CONTRIBUTIONS' && ['CREATE', 'READ'].includes(p.action)) ||
        (p.module === 'CREDITS' && p.action === 'READ'),
      allPermissions,
    );

    // ================================================================
    // 4. CAISSIER PRINCIPAL / CHEF DE CAISSE (Coffre-Fort)
    // Supervise toutes les caissieres. Gere le coffre-fort central.
    // Permissions : validation approvisionnement/delestage, gestion coffre,
    // reception/validation versements agents terrain.
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'CAISSIER_PRINCIPAL',
        description: 'Chef de caisse / Coffre-fort : supervise les caissieres, valide approvisionnement/delestage, gere le coffre-fort, recoit versements agents terrain.',
        maxTransactionAmount: 5000000,
        sessionTimeout: 30,
      },
      (p) =>
        (p.module === 'CLIENTS' && p.action === 'READ') ||
        (p.module === 'ACCOUNTS' && p.action === 'READ') ||
        (p.module === 'TRANSACTIONS' && ['CREATE', 'READ', 'UPDATE'].includes(p.action)) ||
        (p.module === 'CONTRIBUTIONS' && ['CREATE', 'READ', 'UPDATE'].includes(p.action)) ||
        (p.module === 'REPORTS' && p.action === 'READ'),
      allPermissions,
    );

    // ================================================================
    // 5. AGENT DE COLLECTE DE TERRAIN (Collecteur tontine itinerant)
    // Utilise l'app mobile / TPE. Mode hors-ligne autorise.
    // Permissions : consultation solde restreint, encaissement depots terrain,
    // impression recus, transfert point de caisse journalier vers caissier principal.
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'AGENT_TERRAIN',
        description: 'Agent de collecte terrain : encaissement depots hors-ligne, consultation solde, impression recus, transfert vers caissier principal le soir.',
        sessionTimeout: 480, // 8h pour mode hors-ligne
      },
      (p) =>
        (p.module === 'CLIENTS' && ['CREATE', 'READ'].includes(p.action)) ||
        (p.module === 'ACCOUNTS' && p.action === 'READ') ||
        (p.module === 'CONTRIBUTIONS' && ['CREATE', 'READ'].includes(p.action)) ||
        (p.module === 'TRANSACTIONS' && ['CREATE', 'READ'].includes(p.action)),
      allPermissions,
    );

    // ================================================================
    // 6. AGENT DE CREDIT (Analyste financier)
    // Gere le portefeuille de prets.
    // Permissions : simulation, montage dossiers, saisie garanties,
    // analyse ratios, edition rapport pour comite.
    // Restriction : impossible de decaisser au guichet.
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'AGENT_CREDIT',
        description: 'Agent de credit : simulation, montage dossiers, garanties, analyse financiere, rapport pour comite. Pas de decaissement au guichet.',
        sessionTimeout: 30,
      },
      (p) =>
        (p.module === 'CLIENTS' && ['CREATE', 'READ'].includes(p.action)) ||
        (p.module === 'CREDITS' && ['CREATE', 'READ', 'UPDATE'].includes(p.action)) ||
        (p.module === 'ACCOUNTS' && p.action === 'READ') ||
        (p.module === 'TRANSACTIONS' && p.action === 'READ') ||
        (p.module === 'REPORTS' && p.action === 'READ'),
      allPermissions,
    );

    // ================================================================
    // 7. CHEF D'AGENCE (Manager / Superviseur)
    // Pilote les performances d'une succursale.
    // Permissions : validation 1er niveau credits, autorisation depassement plafond,
    // consultation rapports agence, traitement reclamations, annulations erreurs.
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'CHEF_AGENCE',
        description: 'Chef d\'agence : validation credits 1er niveau, autorisation depassement plafond, rapports agence, reclamations, annulations.',
        maxTransactionAmount: 2000000,
        sessionTimeout: 30,
      },
      (p) =>
        (['CLIENTS', 'ACCOUNTS', 'TRANSACTIONS', 'CREDITS', 'CONTRIBUTIONS', 'COMPANIES'].includes(p.module) &&
          ['CREATE', 'READ', 'UPDATE'].includes(p.action)) ||
        (p.module === 'REPORTS' && ['CREATE', 'READ'].includes(p.action)) ||
        (p.module === 'AGENCIES' && p.action === 'READ') ||
        (p.module === 'AUDIT' && p.action === 'READ'),
      allPermissions,
    );

    // ================================================================
    // 8. COMPTABLE / DIRECTEUR FINANCIER
    // Sante financiere globale de la structure.
    // Permissions : gestion plan comptable, ecritures d'ajustement manuelles,
    // generation etats financiers reglementaires (Bilan, Balance, Resultat),
    // execution cloture journaliere (EOD).
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'COMPTABLE',
        description: 'Comptable / Dir. financier : plan comptable, ecritures manuelles, etats financiers, cloture EOD. Pas d\'operations de caisse.',
        sessionTimeout: 30,
      },
      (p) =>
        (p.module === 'ACCOUNTING' && ['CREATE', 'READ', 'UPDATE'].includes(p.action)) ||
        (p.module === 'REPORTS' && ['CREATE', 'READ'].includes(p.action)) ||
        (['CLIENTS', 'ACCOUNTS', 'TRANSACTIONS', 'CREDITS', 'CONTRIBUTIONS', 'COMPANIES'].includes(p.module) && p.action === 'READ') ||
        (p.module === 'SETTINGS' && p.action === 'READ'),
      allPermissions,
    );

    // ================================================================
    // 9. CONTROLEUR INTERNE / AUDITEUR
    // Lutte anti-fraude. Acces complet en LECTURE SEULE.
    // Peut consulter l'historique complet des pistes d'audit.
    // Ne peut ajouter ou modifier aucune donnee.
    // ================================================================
    await this.upsertRoleWithPermissions(
      {
        name: 'AUDITEUR',
        description: 'Controleur interne / Auditeur : lecture seule sur tout le logiciel, pistes d\'audit, historique complet. Ne peut rien modifier.',
        sessionTimeout: 30,
      },
      (p) => p.action === 'READ',
      allPermissions,
    );

    // ================================================================
    // ROLES SUPPLEMENTAIRES (gardes pour compatibilite)
    // ================================================================

    // Directeur General -- vision consolidee, validation finale credits
    await this.upsertRoleWithPermissions(
      {
        name: 'DIRECTEUR_GENERAL',
        description: 'Directeur General : vision consolidee, validation finale credits, supervision toutes agences.',
        sessionTimeout: 45,
      },
      (p) =>
        p.action === 'READ' ||
        (p.module === 'CREDITS' && p.action === 'UPDATE') ||
        (p.module === 'AGENCIES' && ['CREATE', 'UPDATE'].includes(p.action)),
      allPermissions,
    );

    return { message: '11 roles et 52 permissions initialises avec succes' };
  }
}
