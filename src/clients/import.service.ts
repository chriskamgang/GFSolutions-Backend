import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

@Injectable()
export class ImportService {
  private readonly logger = new Logger('ImportService');

  constructor(private prisma: PrismaService) {}

  async importClients(buffer: Buffer, agencyId: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) throw new BadRequestException('Le fichier Excel est vide');
    if (rows.length > 5000) throw new BadRequestException('Maximum 5000 lignes par import');

    const results = { total: rows.length, created: 0, skipped: 0, errors: [] as string[] };
    const baseCount = await this.prisma.client.count();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const phone = String(row.telephone || row.phone || row.tel || '').trim();
        if (!phone) { results.errors.push(`Ligne ${rowNum}: telephone manquant`); results.skipped++; continue; }

        const existing = await this.prisma.client.findFirst({ where: { phone } });
        if (existing) { results.errors.push(`Ligne ${rowNum}: telephone ${phone} existe deja`); results.skipped++; continue; }

        const lastName = String(row.nom || row.lastName || row.last_name || '').trim();
        const firstName = String(row.prenom || row.firstName || row.first_name || '').trim();
        if (!lastName && !firstName) { results.errors.push(`Ligne ${rowNum}: nom/prenom manquant`); results.skipped++; continue; }

        const clientNumber = `CLI-${String(baseCount + results.created + 1).padStart(6, '0')}`;

        const genderRaw = String(row.genre || row.gender || row.sexe || '').toUpperCase().trim();
        const gender = genderRaw.startsWith('M') ? 'MALE' : genderRaw.startsWith('F') ? 'FEMALE' : undefined;

        const docTypeRaw = String(row.type_piece || row.idDocumentType || row.piece || '').toUpperCase().trim();
        let idDocumentType: string | undefined;
        if (docTypeRaw.includes('CNI')) idDocumentType = 'CNI';
        else if (docTypeRaw.includes('PASS')) idDocumentType = 'PASSPORT';
        else if (docTypeRaw.includes('RECE')) idDocumentType = 'RECEPISSE';
        else if (docTypeRaw.includes('RESID') || docTypeRaw.includes('SEJOUR')) idDocumentType = 'RESIDENCE_PERMIT';

        let dateOfBirth: Date | undefined;
        const rawDate = row.date_naissance || row.dateOfBirth || row.date_of_birth;
        if (rawDate) {
          if (typeof rawDate === 'number') {
            dateOfBirth = new Date((rawDate - 25569) * 86400 * 1000);
          } else {
            const parsed = new Date(rawDate);
            if (!isNaN(parsed.getTime())) dateOfBirth = parsed;
          }
        }

        await this.prisma.client.create({
          data: {
            clientNumber,
            clientType: 'PHYSIQUE',
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            phone,
            email: row.email || undefined,
            address: String(row.adresse || row.address || 'Non renseigne'),
            city: String(row.ville || row.city || 'Non renseigne'),
            region: String(row.region || 'Non renseigne'),
            gender: gender as any,
            dateOfBirth,
            idDocumentType: idDocumentType as any,
            idDocumentNumber: row.numero_piece || row.idDocumentNumber || undefined,
            profession: row.profession || undefined,
            agencyId,
          },
        });

        results.created++;
      } catch (err: any) {
        results.errors.push(`Ligne ${rowNum}: ${err.message?.slice(0, 100)}`);
        results.skipped++;
      }
    }

    this.logger.log(`Import clients termine: ${results.created} crees, ${results.skipped} ignores sur ${results.total}`);
    return results;
  }

  async importAccounts(buffer: Buffer, agencyId: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) throw new BadRequestException('Le fichier Excel est vide');

    const results = { total: rows.length, created: 0, skipped: 0, errors: [] as string[] };
    const baseCount = await this.prisma.account.count();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const phone = String(row.telephone_client || row.telephone || row.phone || '').trim();
        if (!phone) { results.errors.push(`Ligne ${rowNum}: telephone manquant`); results.skipped++; continue; }

        const client = await this.prisma.client.findFirst({ where: { phone } });
        if (!client) { results.errors.push(`Ligne ${rowNum}: client ${phone} non trouve`); results.skipped++; continue; }

        const type = String(row.type_compte || row.type || 'CURRENT').toUpperCase().trim();
        const balance = Number(row.solde_initial || row.solde || row.balance || 0);

        const prefix = type === 'SAVINGS' ? 'EP' : type === 'DAT' ? 'DA' : 'CC';
        const accountNumber = `${prefix}-${String(baseCount + results.created + 1).padStart(8, '0')}`;

        await this.prisma.account.create({
          data: {
            accountNumber,
            clientId: client.id,
            agencyId,
            type,
            balance,
            status: 'ACTIVE',
          },
        });

        results.created++;
      } catch (err: any) {
        results.errors.push(`Ligne ${rowNum}: ${err.message?.slice(0, 100)}`);
        results.skipped++;
      }
    }

    this.logger.log(`Import comptes termine: ${results.created} crees, ${results.skipped} ignores sur ${results.total}`);
    return results;
  }

  generateTemplate(type: 'clients' | 'accounts'): Buffer {
    const wb = XLSX.utils.book_new();

    if (type === 'clients') {
      const data = [
        { nom: 'DUPONT', prenom: 'Jean', telephone: '237699000001', email: 'jean@email.com', adresse: 'Rue 123', ville: 'Douala', region: 'Littoral', genre: 'M', type_piece: 'CNI', numero_piece: '123456789', profession: 'Commercant', date_naissance: '1990-01-15' },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Clients');
    } else {
      const data = [
        { telephone_client: '237699000001', type_compte: 'CURRENT', solde_initial: 50000 },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Comptes');
    }

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
}
