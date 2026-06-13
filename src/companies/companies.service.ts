import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    registrationNumber: string;
    address: string;
    city: string;
    phone: string;
    email?: string;
    contactPerson: string;
  }) {
    const existing = await this.prisma.company.findUnique({
      where: { registrationNumber: data.registrationNumber },
    });
    if (existing) {
      throw new ConflictException('Ce numero d\'enregistrement existe deja');
    }

    return this.prisma.company.create({ data });
  }

  async findAll() {
    return this.prisma.company.findMany({
      include: {
        _count: { select: { employees: true, salaryBatches: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        employees: { include: { accounts: true } },
        salaryBatches: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!company) throw new NotFoundException('Entreprise non trouvee');
    return company;
  }

  async getEmployees(companyId: string) {
    return this.prisma.client.findMany({
      where: { companyId },
      include: { accounts: true },
      orderBy: { lastName: 'asc' },
    });
  }

  async addEmployee(companyId: string, data: { clientId?: string; phone?: string }) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Entreprise non trouvee');

    let client: any;

    if (data.clientId) {
      client = await this.prisma.client.findUnique({ where: { id: data.clientId } });
    } else if (data.phone) {
      client = await this.prisma.client.findFirst({ where: { phone: data.phone } });
    }

    if (!client) throw new NotFoundException('Client non trouve. Verifiez l\'ID ou le numero de telephone.');
    if (client.companyId) throw new BadRequestException(`Ce client est deja lie a une entreprise.`);

    return this.prisma.client.update({
      where: { id: client.id },
      data: { companyId },
      include: { accounts: true },
    });
  }

  async removeEmployee(companyId: string, clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client non trouve');
    if (client.companyId !== companyId) throw new BadRequestException('Ce client n\'appartient pas a cette entreprise');

    return this.prisma.client.update({
      where: { id: clientId },
      data: { companyId: null },
    });
  }

  async processSalaryBatch(data: {
    companyId: string;
    payments: { employeeName: string; employeePhone: string; amount: number }[];
  }) {
    const company = await this.findOne(data.companyId);
    if (!company.isActive) {
      throw new BadRequestException('Cette entreprise est desactivee');
    }

    const totalAmount = data.payments.reduce((sum, p) => sum + p.amount, 0);
    const fees = Math.round(totalAmount * 0.005); // 0.5% de frais

    return this.prisma.$transaction(async (tx) => {
      // Creer le batch
      const batch = await tx.salaryBatch.create({
        data: {
          companyId: data.companyId,
          reference: `SAL-${Date.now()}`,
          totalAmount,
          totalEmployees: data.payments.length,
          fees,
          status: 'PENDING',
        },
      });

      // Creer chaque paiement individuel
      await tx.salaryPayment.createMany({
        data: data.payments.map((p) => ({
          batchId: batch.id,
          employeeName: p.employeeName,
          employeePhone: p.employeePhone,
          amount: p.amount,
          status: 'PENDING',
        })),
      });

      // Crediter les comptes des employes
      for (const payment of data.payments) {
        const employee = await tx.client.findFirst({
          where: {
            phone: payment.employeePhone,
            companyId: data.companyId,
          },
          include: { accounts: { where: { type: 'CURRENT' } } },
        });

        if (employee && employee.accounts.length > 0) {
          await tx.account.update({
            where: { id: employee.accounts[0].id },
            data: { balance: { increment: payment.amount } },
          });

          await tx.salaryPayment.updateMany({
            where: {
              batchId: batch.id,
              employeePhone: payment.employeePhone,
            },
            data: { status: 'COMPLETED', processedAt: new Date() },
          });
        }
      }

      await tx.salaryBatch.update({
        where: { id: batch.id },
        data: { status: 'COMPLETED', processedAt: new Date() },
      });

      return tx.salaryBatch.findUnique({
        where: { id: batch.id },
        include: { payments: true },
      });
    });
  }

  async getSalaryHistory(companyId: string) {
    return this.prisma.salaryBatch.findMany({
      where: { companyId },
      include: { payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
