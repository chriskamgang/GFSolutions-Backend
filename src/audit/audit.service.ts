import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: {
    userId: string;
    action: string;
    module: string;
    entityId?: string;
    entityType?: string;
    details?: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
  }) {
    const { details, ...rest } = data;
    return this.prisma.auditLog.create({
      data: {
        ...rest,
        newValues: data.newValues ?? (details ? { details } : undefined),
      },
    });
  }

  async findAll(params: { page?: number; limit?: number; userId?: string; module?: string }) {
    const { page = 1, limit = 20, userId, module } = params;
    const where: any = {};
    if (userId) where.userId = userId;
    if (module) where.module = module;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalToday, totalWeek] = await Promise.all([
      this.prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    return { totalToday, totalWeek };
  }
}
