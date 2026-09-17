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
    // ============================================================
    // PLAN COMPTABLE DES ETABLISSEMENTS DE MICROFINANCE (PCEMF)
    // Norme COBAC / CEMAC — Janvier 2010
    // ============================================================
    const accounts = [
      // ==================== CLASSE 1 — CAPITAUX PERMANENTS ====================
      { code: '1', name: 'Capitaux permanents', type: 'PASSIF', level: 1 },
      { code: '10', name: 'Capital, parts sociales et dotations', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '100', name: 'Parts sociales souscrites appelees', type: 'PASSIF', level: 3, parentCode: '10' },
      { code: '101', name: 'Capital social', type: 'PASSIF', level: 3, parentCode: '10' },
      { code: '102', name: 'Fonds de dotation', type: 'PASSIF', level: 3, parentCode: '10' },
      { code: '104', name: 'Primes liees au capital et parts sociales', type: 'PASSIF', level: 3, parentCode: '10' },
      { code: '11', name: 'Reserves', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '111', name: 'Reserves legales', type: 'PASSIF', level: 3, parentCode: '11' },
      { code: '112', name: 'Reserves obligatoires et reglementaires', type: 'PASSIF', level: 3, parentCode: '11' },
      { code: '113', name: 'Reserves statutaires et contractuelles', type: 'PASSIF', level: 3, parentCode: '11' },
      { code: '114', name: 'Reserves facultatives', type: 'PASSIF', level: 3, parentCode: '11' },
      { code: '12', name: 'Report a nouveau', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '121', name: 'Report a nouveau crediteur', type: 'PASSIF', level: 3, parentCode: '12' },
      { code: '122', name: 'Report a nouveau debiteur', type: 'ACTIF', level: 3, parentCode: '12' },
      { code: '13', name: 'Resultat net de l\'exercice', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '131', name: 'Benefice de l\'exercice', type: 'PASSIF', level: 3, parentCode: '13' },
      { code: '132', name: 'Perte de l\'exercice', type: 'ACTIF', level: 3, parentCode: '13' },
      { code: '14', name: 'Provisions et reserves reglementees', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '141', name: 'Provisions reglementees', type: 'PASSIF', level: 3, parentCode: '14' },
      { code: '142', name: 'Reserves reglementees', type: 'PASSIF', level: 3, parentCode: '14' },
      { code: '15', name: 'Subventions d\'investissement', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '16', name: 'Fonds de financement et de garantie', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '160', name: 'Fonds de solidarite reglementaire', type: 'PASSIF', level: 3, parentCode: '16' },
      { code: '161', name: 'Fonds affectes sur ressources propres', type: 'PASSIF', level: 3, parentCode: '16' },
      { code: '163', name: 'Fonds de garantie et assurance mutuels', type: 'PASSIF', level: 3, parentCode: '16' },
      { code: '17', name: 'Emprunts obligataires', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '18', name: 'Autres ressources permanentes', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '181', name: 'Emprunts participatifs et dettes subordonnees', type: 'PASSIF', level: 3, parentCode: '18' },
      { code: '185', name: 'Emprunts a long et moyen terme', type: 'PASSIF', level: 3, parentCode: '18' },
      { code: '19', name: 'Provisions pour risques et charges', type: 'PASSIF', level: 2, parentCode: '1' },
      { code: '190', name: 'Provision pour risques generaux', type: 'PASSIF', level: 3, parentCode: '19' },
      { code: '191', name: 'Provisions pour charges', type: 'PASSIF', level: 3, parentCode: '19' },

      // ==================== CLASSE 2 — VALEURS IMMOBILISEES ====================
      { code: '2', name: 'Valeurs immobilisees', type: 'ACTIF', level: 1 },
      { code: '20', name: 'Frais et valeurs incorporelles immobilisees', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '201', name: 'Frais immobilises', type: 'ACTIF', level: 3, parentCode: '20' },
      { code: '202', name: 'Valeurs incorporelles immobilisees', type: 'ACTIF', level: 3, parentCode: '20' },
      { code: '2024', name: 'Brevets, logiciels, licences', type: 'ACTIF', level: 4, parentCode: '202' },
      { code: '21', name: 'Terrains', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '211', name: 'Terrains en exploitation', type: 'ACTIF', level: 3, parentCode: '21' },
      { code: '22', name: 'Autres immobilisations corporelles en service', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '221', name: 'Immeubles d\'exploitation', type: 'ACTIF', level: 3, parentCode: '22' },
      { code: '225', name: 'Materiel et mobilier d\'exploitation', type: 'ACTIF', level: 3, parentCode: '22' },
      { code: '229', name: 'Autres immobilisations corporelles', type: 'ACTIF', level: 3, parentCode: '22' },
      { code: '23', name: 'Autres immobilisations corporelles en cours', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '25', name: 'Depots et cautionnements verses', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '26', name: 'Titres de participation et immob. financieres', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '28', name: 'Amortissements des valeurs immobilisees', type: 'ACTIF', level: 2, parentCode: '2' },
      { code: '280', name: 'Amort. valeurs incorporelles immobilisees', type: 'ACTIF', level: 3, parentCode: '28' },
      { code: '282', name: 'Amort. immobilisations corporelles', type: 'ACTIF', level: 3, parentCode: '28' },
      { code: '29', name: 'Provisions pour depreciation valeurs immob.', type: 'PASSIF', level: 2, parentCode: '2' },

      // ==================== CLASSE 3 — OPERATIONS AVEC LA CLIENTELE ====================
      { code: '3', name: 'Operations avec la clientele', type: 'ACTIF', level: 1 },
      // Credits a long et moyen terme
      { code: '30', name: 'Credits a long terme', type: 'ACTIF', level: 2, parentCode: '3' },
      { code: '301', name: 'Credit LT a l\'investissement immobilier', type: 'ACTIF', level: 3, parentCode: '30' },
      { code: '306', name: 'Credits LT a la consommation', type: 'ACTIF', level: 3, parentCode: '30' },
      { code: '308', name: 'Autres credits LT', type: 'ACTIF', level: 3, parentCode: '30' },
      { code: '31', name: 'Credits a moyen terme', type: 'ACTIF', level: 2, parentCode: '3' },
      { code: '311', name: 'Credit MT a l\'investissement immobilier', type: 'ACTIF', level: 3, parentCode: '31' },
      { code: '316', name: 'Credits MT a la consommation', type: 'ACTIF', level: 3, parentCode: '31' },
      { code: '318', name: 'Autres credits MT', type: 'ACTIF', level: 3, parentCode: '31' },
      // Credits a court terme
      { code: '32', name: 'Credits a court terme', type: 'ACTIF', level: 2, parentCode: '3' },
      { code: '322', name: 'Credits de tresorerie', type: 'ACTIF', level: 3, parentCode: '32' },
      { code: '3222', name: 'Credits de tresorerie aux clients', type: 'ACTIF', level: 4, parentCode: '322' },
      { code: '323', name: 'Credits a l\'equipement', type: 'ACTIF', level: 3, parentCode: '32' },
      { code: '326', name: 'Credits a la consommation', type: 'ACTIF', level: 3, parentCode: '32' },
      { code: '3261', name: 'Credits a la consommation aux clients', type: 'ACTIF', level: 4, parentCode: '326' },
      { code: '328', name: 'Autres credits a CT', type: 'ACTIF', level: 3, parentCode: '32' },
      { code: '329', name: 'Creances rattachees aux credits a CT', type: 'ACTIF', level: 3, parentCode: '32' },
      // Creances en souffrance
      { code: '33', name: 'Creances en souffrance', type: 'ACTIF', level: 2, parentCode: '3' },
      { code: '331', name: 'Creances impayees', type: 'ACTIF', level: 3, parentCode: '33' },
      { code: '332', name: 'Creances immobilisees', type: 'ACTIF', level: 3, parentCode: '33' },
      { code: '335', name: 'Autres creances douteuses', type: 'ACTIF', level: 3, parentCode: '33' },
      // Depots a regime special
      { code: '35', name: 'Comptes de depots a regime special', type: 'PASSIF', level: 2, parentCode: '3' },
      { code: '351', name: 'Bons de caisse', type: 'PASSIF', level: 3, parentCode: '35' },
      { code: '352', name: 'Certificats de depots', type: 'PASSIF', level: 3, parentCode: '35' },
      // Depots a terme
      { code: '36', name: 'Comptes de depots a terme', type: 'PASSIF', level: 2, parentCode: '3' },
      { code: '361', name: 'Depots a terme', type: 'PASSIF', level: 3, parentCode: '36' },
      { code: '369', name: 'Dettes rattachees', type: 'PASSIF', level: 3, parentCode: '36' },
      // Decouverts et comptes crediteurs a vue
      { code: '37', name: 'Decouverts et comptes crediteurs a vue', type: 'PASSIF', level: 2, parentCode: '3' },
      { code: '371', name: 'Comptes courants', type: 'PASSIF', level: 3, parentCode: '37' },
      { code: '3712', name: 'Comptes courants clients', type: 'PASSIF', level: 4, parentCode: '371' },
      { code: '373', name: 'Comptes sur livrets', type: 'PASSIF', level: 3, parentCode: '37' },
      { code: '374', name: 'Depots de garantie', type: 'PASSIF', level: 3, parentCode: '37' },
      // Autres comptes de la clientele
      { code: '38', name: 'Autres comptes de la clientele', type: 'PASSIF', level: 2, parentCode: '3' },
      { code: '381', name: 'Dispositions a payer', type: 'PASSIF', level: 3, parentCode: '38' },
      { code: '382', name: 'Comptes bloques', type: 'PASSIF', level: 3, parentCode: '38' },
      // Provisions pour depreciation comptes clientele
      { code: '39', name: 'Provisions pour depreciation comptes clientele', type: 'PASSIF', level: 2, parentCode: '3' },
      { code: '391', name: 'Prov. creances douteuses couv. garantie Etat', type: 'PASSIF', level: 3, parentCode: '39' },
      { code: '393', name: 'Prov. autres creances douteuses', type: 'PASSIF', level: 3, parentCode: '39' },

      // ==================== CLASSE 4 — COMPTES DE TIERS ET DE REGULARISATION ====================
      { code: '4', name: 'Comptes de tiers et de regularisation', type: 'PASSIF', level: 1 },
      { code: '40', name: 'Fournisseurs', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '401', name: 'Fournisseurs, dettes en compte', type: 'PASSIF', level: 3, parentCode: '40' },
      { code: '42', name: 'Personnel', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '421', name: 'Acomptes et avances sur traitement', type: 'ACTIF', level: 3, parentCode: '42' },
      { code: '422', name: 'Remunerations dues', type: 'PASSIF', level: 3, parentCode: '42' },
      { code: '43', name: 'Etat, collectivites publiques', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '430', name: 'Etat, impots et taxes', type: 'PASSIF', level: 3, parentCode: '43' },
      { code: '4301', name: 'Etat, impot sur le benefice', type: 'PASSIF', level: 4, parentCode: '430' },
      { code: '4303', name: 'Etat, TVA facturee', type: 'PASSIF', level: 4, parentCode: '430' },
      { code: '4304', name: 'Etat, TVA due ou credit de TVA', type: 'PASSIF', level: 4, parentCode: '430' },
      { code: '4305', name: 'Etat, TVA deductible', type: 'ACTIF', level: 4, parentCode: '430' },
      { code: '4306', name: 'Etat, autres impots sur le CA', type: 'PASSIF', level: 4, parentCode: '430' },
      { code: '44', name: 'Societaires et actionnaires', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '441', name: 'Societaires et actionnaires, operations capital', type: 'PASSIF', level: 3, parentCode: '44' },
      { code: '45', name: 'Comptes de liaison', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '451', name: 'Siege et agences locales', type: 'PASSIF', level: 3, parentCode: '45' },
      { code: '452', name: 'Comptes de liaison entre agences', type: 'PASSIF', level: 3, parentCode: '45' },
      { code: '46', name: 'Autres debiteurs et crediteurs', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '47', name: 'Comptes de regularisation', type: 'PASSIF', level: 2, parentCode: '4' },
      { code: '471', name: 'Comptes de regularisation actif', type: 'ACTIF', level: 3, parentCode: '47' },
      { code: '472', name: 'Comptes de regularisation passif', type: 'PASSIF', level: 3, parentCode: '47' },
      { code: '49', name: 'Provisions pour depreciation comptes de tiers', type: 'PASSIF', level: 2, parentCode: '4' },

      // ==================== CLASSE 5 — TRESORERIE ET OPERATIONS INTERBANCAIRES ====================
      { code: '5', name: 'Tresorerie et operations interbancaires', type: 'ACTIF', level: 1 },
      { code: '51', name: 'Titres de placement et de transaction', type: 'ACTIF', level: 2, parentCode: '5' },
      { code: '52', name: 'Marche monetaire', type: 'ACTIF', level: 2, parentCode: '5' },
      { code: '56', name: 'Comptes a vue des correspondants', type: 'ACTIF', level: 2, parentCode: '5' },
      { code: '560', name: 'Comptes a vue nostri', type: 'ACTIF', level: 3, parentCode: '56' },
      { code: '561', name: 'Comptes a vue lori', type: 'PASSIF', level: 3, parentCode: '56' },
      { code: '57', name: 'Caisse', type: 'ACTIF', level: 2, parentCode: '5' },
      { code: '571', name: 'Billets et monnaies', type: 'ACTIF', level: 3, parentCode: '57' },
      { code: '5710', name: 'Caisse FCFA', type: 'ACTIF', level: 4, parentCode: '571' },
      { code: '5711', name: 'Caisse devises', type: 'ACTIF', level: 4, parentCode: '571' },
      { code: '58', name: 'Creances en souffrance sur les correspondants', type: 'ACTIF', level: 2, parentCode: '5' },
      { code: '59', name: 'Provisions pour depreciation comptes tresorerie', type: 'PASSIF', level: 2, parentCode: '5' },

      // ==================== CLASSE 6 — COMPTES DE CHARGES ====================
      { code: '6', name: 'Charges', type: 'CHARGE', level: 1 },
      { code: '60', name: 'Charges sur operations de tresorerie et interbancaires', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '601', name: 'Interets sur operations interbancaires', type: 'CHARGE', level: 3, parentCode: '60' },
      { code: '606', name: 'Commissions sur operations de tresorerie', type: 'CHARGE', level: 3, parentCode: '60' },
      { code: '61', name: 'Interets sur operations avec la clientele', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '611', name: 'Interets sur depots a regime special', type: 'CHARGE', level: 3, parentCode: '61' },
      { code: '612', name: 'Interets sur depots a terme', type: 'CHARGE', level: 3, parentCode: '61' },
      { code: '613', name: 'Interets sur comptes sur livrets', type: 'CHARGE', level: 3, parentCode: '61' },
      { code: '614', name: 'Interets sur autres comptes a vue', type: 'CHARGE', level: 3, parentCode: '61' },
      { code: '619', name: 'Interets sur autres comptes de la clientele', type: 'CHARGE', level: 3, parentCode: '61' },
      { code: '62', name: 'Charges diverses sur operations bancaires', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '621', name: 'Frais sur instruments de paiement', type: 'CHARGE', level: 3, parentCode: '62' },
      { code: '624', name: 'Commissions sur transfert de fonds', type: 'CHARGE', level: 3, parentCode: '62' },
      { code: '63', name: 'Charges sur ressources permanentes', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '64', name: 'Charges liees aux activites accessoires', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '642', name: 'Charges sur operations de credit-bail', type: 'CHARGE', level: 3, parentCode: '64' },
      { code: '65', name: 'Charges de personnel et charges generales', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '651', name: 'Charges de personnel', type: 'CHARGE', level: 3, parentCode: '65' },
      { code: '652', name: 'Charges generales d\'exploitation', type: 'CHARGE', level: 3, parentCode: '65' },
      { code: '66', name: 'Impots et taxes', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '661', name: 'Etat, impots et taxes directs', type: 'CHARGE', level: 3, parentCode: '66' },
      { code: '662', name: 'Etat, impots et taxes indirects', type: 'CHARGE', level: 3, parentCode: '66' },
      { code: '67', name: 'Pertes exceptionnelles et sur exercices anterieurs', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '68', name: 'Dotations aux amortissements', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '680', name: 'Dot. amort. frais et valeurs incorporelles', type: 'CHARGE', level: 3, parentCode: '68' },
      { code: '682', name: 'Dot. amort. immobilisations corporelles', type: 'CHARGE', level: 3, parentCode: '68' },
      { code: '69', name: 'Dotations aux provisions et pertes sur creances', type: 'CHARGE', level: 2, parentCode: '6' },
      { code: '691', name: 'Dotations aux provisions', type: 'CHARGE', level: 3, parentCode: '69' },
      { code: '6913', name: 'Dot. provisions depreciation comptes clientele', type: 'CHARGE', level: 4, parentCode: '691' },
      { code: '692', name: 'Pertes sur creances irrecouvrables', type: 'CHARGE', level: 3, parentCode: '69' },

      // ==================== CLASSE 7 — COMPTES DE PRODUITS ====================
      { code: '7', name: 'Produits', type: 'PRODUIT', level: 1 },
      { code: '70', name: 'Produits sur operations de tresorerie et interbancaire', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '701', name: 'Interets sur operations du marche monetaire', type: 'PRODUIT', level: 3, parentCode: '70' },
      { code: '706', name: 'Commissions sur operations de tresorerie', type: 'PRODUIT', level: 3, parentCode: '70' },
      { code: '71', name: 'Produits sur operations avec la clientele', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '711', name: 'Interets sur credits a long terme', type: 'PRODUIT', level: 3, parentCode: '71' },
      { code: '712', name: 'Interets sur credits a moyen terme', type: 'PRODUIT', level: 3, parentCode: '71' },
      { code: '713', name: 'Interets sur credits a court terme', type: 'PRODUIT', level: 3, parentCode: '71' },
      { code: '714', name: 'Interets sur comptes debiteurs de la clientele', type: 'PRODUIT', level: 3, parentCode: '71' },
      { code: '715', name: 'Commissions sur operations avec la clientele', type: 'PRODUIT', level: 3, parentCode: '71' },
      { code: '7151', name: 'Commissions sur credits a long terme', type: 'PRODUIT', level: 4, parentCode: '715' },
      { code: '7152', name: 'Commissions sur credits a moyen terme', type: 'PRODUIT', level: 4, parentCode: '715' },
      { code: '7153', name: 'Commissions sur credits a court terme', type: 'PRODUIT', level: 4, parentCode: '715' },
      { code: '719', name: 'Autres produits', type: 'PRODUIT', level: 3, parentCode: '71' },
      { code: '72', name: 'Produits sur operations diverses', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '720', name: 'Commissions de tenue de compte', type: 'PRODUIT', level: 3, parentCode: '72' },
      { code: '721', name: 'Commissions sur instruments de paiement', type: 'PRODUIT', level: 3, parentCode: '72' },
      { code: '724', name: 'Commissions sur transfert de fonds', type: 'PRODUIT', level: 3, parentCode: '72' },
      { code: '728', name: 'Produits sur moyens de paiements', type: 'PRODUIT', level: 3, parentCode: '72' },
      { code: '75', name: 'Autres produits', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '755', name: 'Autres produits de la clientele ou societaires', type: 'PRODUIT', level: 3, parentCode: '75' },
      { code: '76', name: 'Subventions d\'exploitation et d\'equilibre', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '77', name: 'Profits exceptionnels et sur exercices anterieurs', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '78', name: 'Reprises d\'amortissements', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '79', name: 'Reprises de provisions et recuperations', type: 'PRODUIT', level: 2, parentCode: '7' },
      { code: '791', name: 'Reprises de provisions', type: 'PRODUIT', level: 3, parentCode: '79' },

      // ==================== CLASSE 8 — SOLDES INTERMEDIAIRES DE GESTION ====================
      { code: '8', name: 'Soldes intermediaires de gestion', type: 'PRODUIT', level: 1 },
      { code: '80', name: 'Produit net financier (PNF)', type: 'PRODUIT', level: 2, parentCode: '8' },
      { code: '82', name: 'Resultat d\'exploitation', type: 'PRODUIT', level: 2, parentCode: '8' },
      { code: '85', name: 'Resultat avant impot', type: 'PRODUIT', level: 2, parentCode: '8' },
      { code: '87', name: 'Resultat net avant certification', type: 'PRODUIT', level: 2, parentCode: '8' },
    ];

    let created = 0;
    for (const acc of accounts) {
      await this.prisma.accountPlan.upsert({
        where: { code: acc.code },
        update: { name: acc.name, type: acc.type, level: acc.level, parentCode: acc.parentCode || null },
        create: acc,
      });
      created++;
    }
    return { message: `${created} comptes du plan comptable PCEMF COBAC crees` };
  }

  /**
   * Migration des anciens codes comptables vers le PCEMF COBAC.
   * Transfere les ecritures existantes des anciens comptes vers les nouveaux,
   * puis supprime les anciens comptes vides.
   */
  async migrateToPCEMF() {
    const codeMapping: Record<string, string> = {
      // Ancien code → Nouveau code PCEMF
      // Classe 1 ancienne (Tresorerie) → Classe 5 PCEMF
      // Note: '101' et '102' existent dans le nouveau plan (Capital social, Fonds de dotation)
      // donc on ne les migre pas directement, on cree de nouveaux comptes caisse
      // Classe 2 ancienne (Ops clientele) → Classe 3 PCEMF
      '201': '322',   // Credits CT → Credits de tresorerie
      '202': '316',   // Credits MT → Credits MT consommation
      '203': '301',   // Credits LT → Credit LT investissement
      '221': '3712',  // Comptes courants → Comptes courants clients
      '222': '373',   // Comptes epargne → Comptes sur livrets
      '223': '361',   // DAT → Depots a terme
      // Classe 4 ancienne → Classe 1/4 PCEMF
      '451': '4303',  // TVA collectee → TVA facturee
      '452': '4305',  // TVA deductible → TVA deductible
      // Classe 6 (Charges) — meme classe mais codes differents
      '601': '614',   // Interets sur depots → Interets sur autres comptes a vue
      '702': '715',   // Commissions et frais → Commissions operations clientele
      '701': '713',   // Interets sur credits → Interets credits CT
      '703': '719',   // Penalites de retard → Autres produits
    };

    const results: string[] = [];

    // D'abord s'assurer que le nouveau plan PCEMF est cree
    await this.seedAccountPlan();
    results.push('Plan comptable PCEMF cree/verifie');

    // Migrer les ecritures des anciens comptes vers les nouveaux
    for (const [oldCode, newCode] of Object.entries(codeMapping)) {
      const oldAccount = await this.prisma.accountPlan.findUnique({ where: { code: oldCode } });
      const newAccount = await this.prisma.accountPlan.findUnique({ where: { code: newCode } });

      if (!oldAccount || !newAccount) {
        results.push(`SKIP: ${oldCode} → ${newCode} (compte introuvable)`);
        continue;
      }

      // Transferer les ecritures
      const updated = await this.prisma.journalEntry.updateMany({
        where: { accountId: oldAccount.id },
        data: { accountId: newAccount.id },
      });

      if (updated.count > 0) {
        results.push(`MIGRE: ${oldCode} (${oldAccount.name}) → ${newCode} (${newAccount.name}): ${updated.count} ecritures`);
      }
    }

    // Migrer les ecritures orphelines sur comptes PCEMF classe 1/2 (anciennement caisse/depots)
    // Le compte 10 (maintenant "Capital, parts sociales") peut avoir d'anciennes ecritures de caisse → 5710
    // Le compte 22 (maintenant "Autres immob corporelles") peut avoir d'anciennes ecritures de depots → 3712
    const orphanMappings = [
      { fromCode: '10', toCode: '5710', label: 'Caisse → Caisse FCFA' },
      { fromCode: '22', toCode: '3712', label: 'Depots → Comptes courants clients' },
    ];
    for (const m of orphanMappings) {
      const fromAcc = await this.prisma.accountPlan.findUnique({ where: { code: m.fromCode } });
      const toAcc = await this.prisma.accountPlan.findUnique({ where: { code: m.toCode } });
      if (fromAcc && toAcc) {
        const updated = await this.prisma.journalEntry.updateMany({
          where: { accountId: fromAcc.id },
          data: { accountId: toAcc.id },
        });
        if (updated.count > 0) results.push(`MIGRE: ${m.fromCode} → ${m.toCode} (${m.label}): ${updated.count} ecritures`);
      }
    }

    // Migrer les anciens comptes caisse (101/102/111 ancien plan) → nouveaux codes PCEMF
    // On cherche par nom car les codes 101/102 existent aussi dans le PCEMF (Capital social)
    const ancienCaisseSiege = await this.prisma.accountPlan.findFirst({
      where: { code: '101', name: { contains: 'Caisse' } },
    });
    if (ancienCaisseSiege) {
      // Ce compte 101 "Caisse siege" est l'ancien — migrer vers 5710
      const newCaisse = await this.prisma.accountPlan.findUnique({ where: { code: '5710' } });
      if (newCaisse) {
        const updated = await this.prisma.journalEntry.updateMany({
          where: { accountId: ancienCaisseSiege.id },
          data: { accountId: newCaisse.id },
        });
        if (updated.count > 0) results.push(`MIGRE: 101 (Caisse siege) → 5710 (Caisse FCFA): ${updated.count} ecritures`);
      }
    }

    const ancienCaisseAgence = await this.prisma.accountPlan.findFirst({
      where: { code: '102', name: { contains: 'Caisse' } },
    });
    if (ancienCaisseAgence) {
      const newCaisse = await this.prisma.accountPlan.findUnique({ where: { code: '5710' } });
      if (newCaisse) {
        const updated = await this.prisma.journalEntry.updateMany({
          where: { accountId: ancienCaisseAgence.id },
          data: { accountId: newCaisse.id },
        });
        if (updated.count > 0) results.push(`MIGRE: 102 (Caisse agences) → 5710 (Caisse FCFA): ${updated.count} ecritures`);
      }
    }

    const ancienBanque = await this.prisma.accountPlan.findFirst({
      where: { code: '111', name: { contains: 'bancaire' } },
    });
    if (ancienBanque) {
      const newBanque = await this.prisma.accountPlan.findUnique({ where: { code: '560' } });
      if (newBanque) {
        const updated = await this.prisma.journalEntry.updateMany({
          where: { accountId: ancienBanque.id },
          data: { accountId: newBanque.id },
        });
        if (updated.count > 0) results.push(`MIGRE: 111 (Comptes bancaires) → 560 (Comptes a vue nostri): ${updated.count} ecritures`);
      }
    }

    // Supprimer les anciens comptes qui n'ont plus d'ecritures et ne font pas partie du PCEMF
    const oldOnlyCodes = ['12', '20', '21', '22', '23', '33', '40', '41', '42', '43', '44', '45',
                           '60', '61', '62', '63', '64', '70', '71'];
    for (const code of oldOnlyCodes) {
      const acc = await this.prisma.accountPlan.findUnique({ where: { code } });
      if (!acc) continue;
      const entries = await this.prisma.journalEntry.count({ where: { accountId: acc.id } });
      const children = await this.prisma.accountPlan.count({ where: { parentCode: code } });
      if (entries === 0 && children === 0) {
        await this.prisma.accountPlan.delete({ where: { code } });
        results.push(`SUPPRIME: ${code} (${acc.name}) — ancien plan, aucune ecriture`);
      }
    }

    this.logger.log(`Migration PCEMF terminee: ${results.length} operations`);
    return { message: 'Migration vers PCEMF COBAC terminee', details: results };
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
   * Ecriture auto pour un depot client (PCEMF COBAC)
   * Debit: 5710 Caisse FCFA (ou 560 Comptes a vue nostri si Mobile Money) | Credit: 3712 Comptes courants clients
   * + Debit: 3712 (frais) | Credit: 715 Commissions sur operations clientele
   * + Debit: 715 -> Credit: 4303 TVA facturee
   */
  async recordDeposit(agencyId: string, amount: number, fees: number, tax: number, reference: string, isMobileMoney: boolean) {
    const debitCode = isMobileMoney ? '560' : '5710';
    const entries: any[] = [];

    // Depot principal
    entries.push(await this.createEntry({
      date: new Date(), debitAccountCode: debitCode, creditAccountCode: '3712',
      amount, label: `Depot client - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
    }));

    // Frais
    if (fees > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '3712', creditAccountCode: '715',
        amount: fees, label: `Frais depot - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
      }));
    }

    // TVA sur frais
    if (tax > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '715', creditAccountCode: '4303',
        amount: tax, label: `TVA sur frais - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
      }));
    }

    return entries;
  }

  /**
   * Ecriture auto pour un retrait client (PCEMF COBAC)
   * Debit: 3712 Comptes courants clients | Credit: 5710 Caisse FCFA (ou 560 si MoMo)
   */
  async recordWithdrawal(agencyId: string, amount: number, fees: number, tax: number, reference: string, isMobileMoney: boolean) {
    const creditCode = isMobileMoney ? '560' : '5710';
    const entries: any[] = [];

    entries.push(await this.createEntry({
      date: new Date(), debitAccountCode: '3712', creditAccountCode: creditCode,
      amount, label: `Retrait client - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
    }));

    if (fees > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '3712', creditAccountCode: '715',
        amount: fees, label: `Frais retrait - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
      }));
    }

    if (tax > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '715', creditAccountCode: '4303',
        amount: tax, label: `TVA sur frais - ${reference}`, reference, sourceModule: 'TRANSACTION', agencyId,
      }));
    }

    return entries;
  }

  /**
   * Ecriture auto pour decaissement credit (PCEMF COBAC)
   * Debit: 322 Credits CT / 316 Credits MT / 301 Credits LT | Credit: 3712 Comptes courants clients
   */
  async recordCreditDisbursement(agencyId: string, amount: number, durationMonths: number, reference: string) {
    const accountCode = durationMonths <= 12 ? '322' : durationMonths <= 36 ? '316' : '301';
    return this.createEntry({
      date: new Date(), debitAccountCode: accountCode, creditAccountCode: '3712',
      amount, label: `Decaissement credit - ${reference}`, reference, sourceModule: 'CREDIT', agencyId,
    });
  }

  /**
   * Ecriture auto pour remboursement credit (PCEMF COBAC)
   * Debit: 3712 Comptes courants clients | Credit: 322 Credits CT (capital)
   * Debit: 3712 Comptes courants clients | Credit: 713 Interets sur credits CT
   */
  async recordCreditRepayment(agencyId: string, principal: number, interest: number, reference: string) {
    const entries: any[] = [];
    if (principal > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '3712', creditAccountCode: '322',
        amount: principal, label: `Remboursement capital - ${reference}`, reference, sourceModule: 'CREDIT', agencyId,
      }));
    }
    if (interest > 0) {
      entries.push(await this.createEntry({
        date: new Date(), debitAccountCode: '3712', creditAccountCode: '713',
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
   * Journaux auxiliaires PCEMF COBAC
   * CAISSE : ecritures impliquant comptes 5710, 5711 (Classe 57 Caisse)
   * BANQUE : ecritures impliquant compte 560 (Comptes a vue nostri)
   * OD : toutes les autres ecritures (operations diverses)
   */
  async getJournalAuxiliaire(params: {
    type: 'CAISSE' | 'BANQUE' | 'OD';
    page?: number; limit?: number;
    startDate?: string; endDate?: string;
  }) {
    const { type, page = 1, limit = 50, startDate, endDate } = params;

    // Trouver les IDs des comptes caisse et banque (PCEMF)
    const caisseAccounts = await this.prisma.accountPlan.findMany({
      where: { code: { in: ['5710', '5711'] } },
    });
    const banqueAccounts = await this.prisma.accountPlan.findMany({
      where: { code: { in: ['560'] } },
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
        code: '131', name: 'Resultat de l\'exercice', type: 'PASSIF',
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

    // Tresorerie d'ouverture (solde comptes 5710, 5711, 560 AVANT la periode)
    let tresorerieOuverture = 0;
    if (startDate) {
      const beforeWhere = { date: { lt: new Date(startDate) } };
      const tresoAccounts = await this.prisma.accountPlan.findMany({
        where: { code: { in: ['5710', '5711', '560'] } },
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
    // Produits d'exploitation encaisses (PCEMF: 71x interets credits, 715 commissions, 719 autres)
    const produitsExpl = await this.getAccountFlow(['713', '715', '719', '72'], periodWhere);
    // Charges d'exploitation decaissees (PCEMF: 61x interets depots, 65x charges generales/personnel)
    const chargesExpl = await this.getAccountFlow(['614', '651', '652'], periodWhere);
    // Variation des depots clientele (PCEMF: 3712 comptes courants, 373 livrets, 361 DAT)
    const variationDepots = await this.getAccountFlow(['3712', '373', '361'], periodWhere);
    // Variation des credits (PCEMF: 322 CT, 316 MT, 301 LT)
    const variationCreditsRaw = await this.getAccountFlow(['322', '316', '301'], periodWhere);
    const variationCredits = variationCreditsRaw.map(v => ({ ...v, flux: -v.flux }));
    // Provisions et creances douteuses (PCEMF: 39x provisions clientele, 691 dotations provisions)
    const provisions = await this.getAccountFlow(['39', '691'], periodWhere);
    // TVA nette (PCEMF: 4303 TVA facturee, 4305 TVA deductible)
    const tva = await this.getAccountFlow(['4303', '4305'], periodWhere);

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
    // PCEMF: 202 valeurs incorporelles, 225 materiel/mobilier, 282 amortissements
    const investDetails = await this.getAccountFlow(['202', '225', '282'], periodWhere);
    const investissement = investDetails.map(i => ({ ...i, categorie: 'Immobilisations' }));
    const fluxInvestissement = investissement.reduce((s, l) => s + l.flux, 0);

    // ---- FINANCEMENT ----
    // PCEMF: 101 capital social, 111 reserves legales, 121 report a nouveau
    const financementDetails = await this.getAccountFlow(['101', '111', '121'], periodWhere);
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
