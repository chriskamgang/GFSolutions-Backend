import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('Dashboard')
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHello() {
    return { message: 'API MicroFinance Cameroun v1.0', status: 'running' };
  }

  @Get('dashboard/stats')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async getDashboardStats() {
    const [
      totalClients,
      totalAccounts,
      activeAccounts,
      totalTransactions,
      recentTransactions,
    ] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.account.count(),
      this.prisma.account.count({ where: { status: 'ACTIVE' } }),
      this.prisma.transaction.count(),
      this.prisma.transaction.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          fromAccount: {
            include: { client: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
    ]);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [depositsMonth, withdrawalsMonth] = await Promise.all([
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: startOfMonth } },
      }),
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: { gte: startOfMonth } },
      }),
    ]);

    return {
      totalClients,
      totalAccounts,
      activeAccounts,
      totalTransactions,
      depositsMonth: Number(depositsMonth._sum.amount || 0),
      withdrawalsMonth: Number(withdrawalsMonth._sum.amount || 0),
      recentTransactions: recentTransactions.map(t => ({
        id: t.id,
        date: t.createdAt,
        client: t.fromAccount?.client
          ? `${t.fromAccount.client.firstName} ${t.fromAccount.client.lastName}`
          : '-',
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
      })),
    };
  }
}
