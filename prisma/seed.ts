import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';

const dbUrl = new URL(process.env.DATABASE_URL ?? 'mysql://root:@localhost:3306/microfinance_db');
const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: Number(dbUrl.port) || 3306,
  user: dbUrl.username,
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace('/', ''),
});

const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('Initialisation des donnees...');

  // ==================== PERMISSIONS ====================
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

  console.log('Creation des permissions...');
  for (const module of modules) {
    for (const action of actions) {
      await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action, description: `${action} ${module}` },
      });
    }
  }

  const allPermissions = await prisma.permission.findMany();
  console.log(`${allPermissions.length} permissions creees.`);

  // ==================== ROLES ====================
  console.log('Creation des roles...');

  // Super Admin
  const superAdmin = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      description: 'Acces total, parametrage global',
      isSystem: true,
      sessionTimeout: 60,
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: superAdmin.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: superAdmin.id, permissionId: p.id })),
  });

  // Directeur General
  const dg = await prisma.role.upsert({
    where: { name: 'DIRECTEUR_GENERAL' },
    update: {},
    create: {
      name: 'DIRECTEUR_GENERAL',
      description: 'Vision consolidee, validation finale',
      isSystem: true,
      sessionTimeout: 45,
    },
  });
  const dgPerms = allPermissions.filter(
    (p) =>
      p.action === 'READ' ||
      (p.module === 'CREDITS' && p.action === 'UPDATE') ||
      (p.module === 'AGENCIES' && ['CREATE', 'UPDATE'].includes(p.action)),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: dg.id } });
  await prisma.rolePermission.createMany({
    data: dgPerms.map((p) => ({ roleId: dg.id, permissionId: p.id })),
  });

  // Directeur Regional
  const dr = await prisma.role.upsert({
    where: { name: 'DIRECTEUR_REGIONAL' },
    update: {},
    create: {
      name: 'DIRECTEUR_REGIONAL',
      description: 'Gestion de sa region, validation credits',
      isSystem: true,
      maxTransactionAmount: 10000000,
      sessionTimeout: 30,
    },
  });
  const drPerms = allPermissions.filter(
    (p) =>
      p.action === 'READ' ||
      (p.module === 'CREDITS' && p.action === 'UPDATE') ||
      (p.module === 'AGENCIES' && p.action === 'UPDATE'),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: dr.id } });
  await prisma.rolePermission.createMany({
    data: drPerms.map((p) => ({ roleId: dr.id, permissionId: p.id })),
  });

  // Chef d'agence
  const chefAgence = await prisma.role.upsert({
    where: { name: 'CHEF_AGENCE' },
    update: {},
    create: {
      name: 'CHEF_AGENCE',
      description: 'Gestion complete de son agence',
      isSystem: true,
      maxTransactionAmount: 2000000,
      sessionTimeout: 30,
    },
  });
  const chefPerms = allPermissions.filter(
    (p) =>
      ['CLIENTS', 'ACCOUNTS', 'TRANSACTIONS', 'CREDITS', 'CONTRIBUTIONS', 'COMPANIES'].includes(p.module) &&
      ['CREATE', 'READ', 'UPDATE'].includes(p.action),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: chefAgence.id } });
  await prisma.rolePermission.createMany({
    data: chefPerms.map((p) => ({ roleId: chefAgence.id, permissionId: p.id })),
  });

  // Agent de credit
  const agentCredit = await prisma.role.upsert({
    where: { name: 'AGENT_CREDIT' },
    update: {},
    create: {
      name: 'AGENT_CREDIT',
      description: 'Gestion des dossiers de credit',
      isSystem: true,
      sessionTimeout: 30,
    },
  });
  const agentCreditPerms = allPermissions.filter(
    (p) =>
      (p.module === 'CLIENTS' && ['CREATE', 'READ'].includes(p.action)) ||
      (p.module === 'CREDITS' && ['CREATE', 'READ', 'UPDATE'].includes(p.action)) ||
      (p.module === 'ACCOUNTS' && p.action === 'READ') ||
      (p.module === 'TRANSACTIONS' && p.action === 'READ'),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: agentCredit.id } });
  await prisma.rolePermission.createMany({
    data: agentCreditPerms.map((p) => ({ roleId: agentCredit.id, permissionId: p.id })),
  });

  // Caissier
  const caissier = await prisma.role.upsert({
    where: { name: 'CAISSIER' },
    update: {},
    create: {
      name: 'CAISSIER',
      description: 'Operations de caisse',
      isSystem: true,
      maxTransactionAmount: 500000,
      sessionTimeout: 15,
    },
  });
  const caissierPerms = allPermissions.filter(
    (p) =>
      (p.module === 'CLIENTS' && p.action === 'READ') ||
      (p.module === 'ACCOUNTS' && ['CREATE', 'READ', 'UPDATE'].includes(p.action)) ||
      (p.module === 'TRANSACTIONS' && ['CREATE', 'READ'].includes(p.action)) ||
      (p.module === 'CONTRIBUTIONS' && ['CREATE', 'READ'].includes(p.action)),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: caissier.id } });
  await prisma.rolePermission.createMany({
    data: caissierPerms.map((p) => ({ roleId: caissier.id, permissionId: p.id })),
  });

  // Agent terrain
  const agentTerrain = await prisma.role.upsert({
    where: { name: 'AGENT_TERRAIN' },
    update: {},
    create: {
      name: 'AGENT_TERRAIN',
      description: 'Collecte et enrolement sur le terrain',
      isSystem: true,
      sessionTimeout: 480,
    },
  });
  const agentTerrainPerms = allPermissions.filter(
    (p) =>
      (p.module === 'CLIENTS' && ['CREATE', 'READ'].includes(p.action)) ||
      (p.module === 'TRANSACTIONS' && ['CREATE', 'READ'].includes(p.action)) ||
      (p.module === 'CONTRIBUTIONS' && ['CREATE', 'READ'].includes(p.action)),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: agentTerrain.id } });
  await prisma.rolePermission.createMany({
    data: agentTerrainPerms.map((p) => ({ roleId: agentTerrain.id, permissionId: p.id })),
  });

  // Comptable
  const comptable = await prisma.role.upsert({
    where: { name: 'COMPTABLE' },
    update: {},
    create: {
      name: 'COMPTABLE',
      description: 'Acces module comptabilite et rapports',
      isSystem: true,
      sessionTimeout: 30,
    },
  });
  const comptablePerms = allPermissions.filter(
    (p) =>
      p.action === 'READ' ||
      (p.module === 'ACCOUNTING' && ['CREATE', 'UPDATE', 'DELETE'].includes(p.action)) ||
      (p.module === 'REPORTS' && ['CREATE'].includes(p.action)),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: comptable.id } });
  await prisma.rolePermission.createMany({
    data: comptablePerms.map((p) => ({ roleId: comptable.id, permissionId: p.id })),
  });

  // Auditeur
  const auditeur = await prisma.role.upsert({
    where: { name: 'AUDITEUR' },
    update: {},
    create: {
      name: 'AUDITEUR',
      description: 'Lecture seule sur tous les modules',
      isSystem: true,
      sessionTimeout: 30,
    },
  });
  const auditeurPerms = allPermissions.filter((p) => p.action === 'READ');
  await prisma.rolePermission.deleteMany({ where: { roleId: auditeur.id } });
  await prisma.rolePermission.createMany({
    data: auditeurPerms.map((p) => ({ roleId: auditeur.id, permissionId: p.id })),
  });

  // Support client
  const support = await prisma.role.upsert({
    where: { name: 'SUPPORT_CLIENT' },
    update: {},
    create: {
      name: 'SUPPORT_CLIENT',
      description: 'Consultation clients, gestion reclamations',
      isSystem: true,
      sessionTimeout: 30,
    },
  });
  const supportPerms = allPermissions.filter(
    (p) =>
      (p.module === 'CLIENTS' && ['READ', 'UPDATE'].includes(p.action)) ||
      (['ACCOUNTS', 'TRANSACTIONS', 'CREDITS', 'CONTRIBUTIONS'].includes(p.module) && p.action === 'READ'),
  );
  await prisma.rolePermission.deleteMany({ where: { roleId: support.id } });
  await prisma.rolePermission.createMany({
    data: supportPerms.map((p) => ({ roleId: support.id, permissionId: p.id })),
  });

  console.log('10 roles crees avec leurs permissions.');

  // ==================== AGENCE SIEGE ====================
  console.log('Creation de l\'agence siege...');
  const siege = await prisma.agency.upsert({
    where: { code: 'SIEGE-001' },
    update: {},
    create: {
      name: 'Siege Social',
      code: 'SIEGE-001',
      address: 'Douala, Cameroun',
      city: 'Douala',
      region: 'Littoral',
      phone: '+237690000000',
      email: 'contact@microfinance.cm',
    },
  });

  // ==================== SUPER ADMIN USER ====================
  console.log('Creation du Super Admin...');
  const hashedPassword = await bcrypt.hash('Admin@2024', 10);

  await prisma.user.upsert({
    where: { email: 'admin@microfinance.cm' },
    update: {},
    create: {
      email: 'admin@microfinance.cm',
      phone: '+237690000001',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      roleId: superAdmin.id,
      agencyId: siege.id,
      language: 'FR',
    },
  });

  // ==================== PARAMETRES PAR DEFAUT ====================
  console.log('Creation des parametres par defaut...');
  const defaultSettings = [
    { key: 'TAX_RATE', value: '19.25', category: 'FINANCE', description: 'Taux TVA Cameroun (%)' },
    { key: 'DEPOSIT_FEE_RATE', value: '1', category: 'FINANCE', description: 'Frais de depot (%)' },
    { key: 'WITHDRAWAL_FEE_RATE', value: '1', category: 'FINANCE', description: 'Frais de retrait (%)' },
    { key: 'TRANSFER_FEE_RATE', value: '0.5', category: 'FINANCE', description: 'Frais de transfert (%)' },
    { key: 'SALARY_FEE_RATE', value: '0.5', category: 'FINANCE', description: 'Frais virement salaire (%)' },
    { key: 'MIN_DEPOSIT', value: '500', category: 'LIMITS', description: 'Depot minimum (FCFA)' },
    { key: 'MAX_DEPOSIT_DAILY', value: '5000000', category: 'LIMITS', description: 'Depot max par jour (FCFA)' },
    { key: 'MIN_WITHDRAWAL', value: '500', category: 'LIMITS', description: 'Retrait minimum (FCFA)' },
    { key: 'MAX_WITHDRAWAL_DAILY', value: '2000000', category: 'LIMITS', description: 'Retrait max par jour (FCFA)' },
    { key: 'DEFAULT_SAVINGS_RATE', value: '3.5', category: 'SAVINGS', description: 'Taux epargne par defaut (%)' },
    { key: 'LATE_PAYMENT_PENALTY_RATE', value: '2', category: 'CREDITS', description: 'Penalite retard credit (%)' },
    { key: 'CONTRIBUTION_PENALTY_RATE', value: '5', category: 'CONTRIBUTIONS', description: 'Penalite retard cotisation (%)' },
    { key: 'CURRENCY', value: 'XAF', category: 'GENERAL', description: 'Devise' },
    { key: 'COUNTRY', value: 'CM', category: 'GENERAL', description: 'Pays' },
    { key: 'PHONE_PREFIX', value: '+237', category: 'GENERAL', description: 'Indicatif telephonique' },
  ];

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log(`${defaultSettings.length} parametres crees.`);

  // ==================== PRODUITS DE COMPTE ====================
  console.log('Creation des produits de compte...');

  const accountProducts = [
    {
      code: 'CC-001',
      name: 'Compte Courant Classique',
      type: 'CURRENT',
      description: 'Compte pour les operations quotidiennes (depots, retraits, virements)',
      interestRate: 0,
      minOpeningDeposit: 5000,
      openingFees: 1000,
      minBalance: 2000,
      maintenanceFees: 0,
      lockDurationMonths: 0,
      earlyWithdrawalPenalty: 0,
    },
    {
      code: 'EP-001',
      name: 'Epargne Remuneree',
      type: 'SAVINGS',
      description: 'Compte epargne avec interets calcules par quinzaines, depot et retrait libres',
      interestRate: 3.5,
      minOpeningDeposit: 5000,
      openingFees: 1000,
      minBalance: 2000,
      maintenanceFees: 0,
      lockDurationMonths: 0,
      earlyWithdrawalPenalty: 0,
    },
    {
      code: 'DAT-001',
      name: 'Depot a Terme (DAT)',
      type: 'DAT',
      description: 'Epargne bloquee a taux superieur, duree minimale 3 mois, utilisable comme garantie de credit',
      interestRate: 6.0,
      minOpeningDeposit: 50000,
      openingFees: 0,
      minBalance: 50000,
      maintenanceFees: 0,
      lockDurationMonths: 3,
      earlyWithdrawalPenalty: 2.0,
    },
    {
      code: 'COL-001',
      name: 'Carnet de Collecte / Tontine',
      type: 'COLLECTE',
      description: 'Compte de collecte pour les cotisations et tontines de groupe',
      interestRate: 2.0,
      minOpeningDeposit: 1000,
      openingFees: 500,
      minBalance: 0,
      maintenanceFees: 0,
      lockDurationMonths: 0,
      earlyWithdrawalPenalty: 0,
    },
  ];

  for (const product of accountProducts) {
    await prisma.accountProduct.upsert({
      where: { code: product.code },
      update: {},
      create: product,
    });
  }

  console.log(`${accountProducts.length} produits de compte crees.`);
  console.log('\n=== Initialisation terminee ===');
  console.log('Super Admin: admin@microfinance.cm / Admin@2024');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
