import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const adapter = new PrismaMariaDb({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'microfinance_db',
});

const prisma = new PrismaClient({ adapter } as any);

function generateRef() {
  return `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function generateAccountNumber() {
  return `MFC-${Math.random().toString().slice(2, 12)}`;
}

async function main() {
  console.log('Creation des donnees de demonstration...');

  // Recuperer l'agence
  const agency = await prisma.agency.findFirst();
  if (!agency) throw new Error('Aucune agence trouvee. Lancez le seed principal d\'abord.');

  // Creer des clients de demo
  const clientsData = [
    { firstName: 'Jean', lastName: 'Kamga', phone: '+237670000001', gender: 'MALE', address: 'Akwa', city: 'Douala', region: 'Littoral', dateOfBirth: new Date('1985-03-15') },
    { firstName: 'Marie', lastName: 'Tchoumi', phone: '+237670000002', gender: 'FEMALE', address: 'Bastos', city: 'Yaounde', region: 'Centre', dateOfBirth: new Date('1990-07-22') },
    { firstName: 'Paul', lastName: 'Nganou', phone: '+237670000003', gender: 'MALE', address: 'Centre ville', city: 'Bafoussam', region: 'Ouest', dateOfBirth: new Date('1978-11-05') },
    { firstName: 'Claire', lastName: 'Mbouda', phone: '+237670000004', gender: 'FEMALE', address: 'Bonapriso', city: 'Douala', region: 'Littoral', dateOfBirth: new Date('1992-01-18') },
    { firstName: 'Eric', lastName: 'Fotso', phone: '+237670000005', gender: 'MALE', address: 'Mvan', city: 'Yaounde', region: 'Centre', dateOfBirth: new Date('1988-06-30') },
    { firstName: 'Nadine', lastName: 'Atangana', phone: '+237670000006', gender: 'FEMALE', address: 'Bonanjo', city: 'Douala', region: 'Littoral', dateOfBirth: new Date('1995-04-12') },
    { firstName: 'Michel', lastName: 'Tabi', phone: '+237670000007', gender: 'MALE', address: 'Centre', city: 'Kribi', region: 'Sud', dateOfBirth: new Date('1982-09-25') },
    { firstName: 'Florence', lastName: 'Njoya', phone: '+237670000008', gender: 'FEMALE', address: 'Commercial Ave', city: 'Bamenda', region: 'Nord-Ouest', dateOfBirth: new Date('1991-12-08') },
    { firstName: 'Alain', lastName: 'Dongmo', phone: '+237670000009', gender: 'MALE', address: 'Bepanda', city: 'Douala', region: 'Littoral', dateOfBirth: new Date('1987-02-14') },
    { firstName: 'Sylvie', lastName: 'Mbarga', phone: '+237670000010', gender: 'FEMALE', address: 'Nlongkak', city: 'Yaounde', region: 'Centre', dateOfBirth: new Date('1993-08-03') },
  ];

  const clients = [];
  for (const c of clientsData) {
    const client = await prisma.client.upsert({
      where: { phone: c.phone },
      update: {},
      create: {
        ...c,
        clientNumber: `CLT-${String(clientsData.indexOf(c) + 1).padStart(6, '0')}`,
        agencyId: agency.id,
        status: 'ACTIVE',
        idDocumentType: 'CNI',
        idDocumentNumber: `CM${Math.random().toString().slice(2, 12)}`,
      },
    });
    clients.push(client);
  }
  console.log(`${clients.length} clients crees.`);

  // Creer des comptes courants
  const accounts = [];
  for (const client of clients) {
    const existing = await prisma.account.findFirst({ where: { clientId: client.id } });
    if (existing) {
      accounts.push(existing);
      continue;
    }
    const account = await prisma.account.create({
      data: {
        accountNumber: generateAccountNumber(),
        clientId: client.id,
        agencyId: agency.id,
        type: 'CURRENT',
        status: 'ACTIVE',
        balance: 0,
      },
    });
    accounts.push(account);
  }
  console.log(`${accounts.length} comptes crees.`);

  // Creer des transactions de depot
  const transactions = [];
  const amounts = [50000, 100000, 150000, 200000, 250000, 300000, 500000, 750000, 1000000, 150000];

  for (let i = 0; i < accounts.length; i++) {
    const depositAmount = amounts[i];
    const daysAgo = Math.floor(Math.random() * 15);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    // Depot
    const tx = await prisma.transaction.create({
      data: {
        reference: generateRef(),
        type: 'DEPOSIT',
        amount: depositAmount,
        fees: Math.round(depositAmount * 0.01),
        tax: Math.round(depositAmount * 0.01 * 0.1925),
        toAccountId: accounts[i].id,
        agencyId: agency.id,
        status: 'COMPLETED',
        description: i % 3 === 0 ? 'Depot via Orange Money' : i % 3 === 1 ? 'Depot via MTN MoMo' : 'Depot en especes au guichet',
        mobileMoneyProvider: i % 3 === 0 ? 'ORANGE_MONEY' : i % 3 === 1 ? 'MTN_MOMO' : null,
        createdAt: date,
      },
    });
    transactions.push(tx);

    // Mettre a jour le solde du compte
    await prisma.account.update({
      where: { id: accounts[i].id },
      data: { balance: { increment: depositAmount } },
    });
  }

  // Quelques retraits
  for (let i = 0; i < 5; i++) {
    const withdrawAmount = Math.round(amounts[i] * 0.3);
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 7));

    await prisma.transaction.create({
      data: {
        reference: generateRef(),
        type: 'WITHDRAWAL',
        amount: withdrawAmount,
        fees: Math.round(withdrawAmount * 0.01),
        tax: Math.round(withdrawAmount * 0.01 * 0.1925),
        fromAccountId: accounts[i].id,
        agencyId: agency.id,
        status: 'COMPLETED',
        description: 'Retrait en especes au guichet',
        createdAt: date,
      },
    });

    await prisma.account.update({
      where: { id: accounts[i].id },
      data: { balance: { decrement: withdrawAmount } },
    });
  }

  // Un transfert
  await prisma.transaction.create({
    data: {
      reference: generateRef(),
      type: 'TRANSFER',
      amount: 75000,
      fees: 375,
      tax: 72,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      agencyId: agency.id,
      status: 'COMPLETED',
      description: 'Transfert interne',
      createdAt: new Date(),
    },
  });
  await prisma.account.update({ where: { id: accounts[0].id }, data: { balance: { decrement: 75000 } } });
  await prisma.account.update({ where: { id: accounts[1].id }, data: { balance: { increment: 75000 } } });

  console.log(`${transactions.length + 6} transactions creees.`);
  console.log('\n=== Donnees de demonstration pretes ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
