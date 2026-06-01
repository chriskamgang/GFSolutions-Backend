import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    targetType: string;
    targetId: string;
    title: string;
    message: string;
    channel?: string;
  }) {
    return this.prisma.notification.create({
      data: {
        targetType: data.targetType,
        targetId: data.targetId,
        title: data.title,
        message: data.message,
        channel: data.channel || 'SYSTEM',
      },
    });
  }

  async findAll(params: { page?: number; limit?: number; targetId?: string; targetType?: string; isRead?: boolean }) {
    const { page = 1, limit = 20, targetId, targetType, isRead } = params;
    const where: any = {};
    if (targetId) where.targetId = targetId;
    if (targetType) where.targetType = targetType;
    if (isRead !== undefined) where.isRead = isRead;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(targetId: string) {
    return this.prisma.notification.updateMany({
      where: { targetId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCount(targetId: string) {
    const count = await this.prisma.notification.count({
      where: { targetId, isRead: false },
    });
    return { count };
  }

  // Notifications pre-configurees pour les clients
  async notifyDeposit(clientId: string, amount: number, accountNumber: string) {
    return this.create({
      targetType: 'CLIENT',
      targetId: clientId,
      title: 'Depot recu',
      message: `Depot de ${amount.toLocaleString('fr-FR')} FCFA sur votre compte ${accountNumber}.`,
      channel: 'SMS',
    });
  }

  async notifyWithdrawal(clientId: string, amount: number, accountNumber: string) {
    return this.create({
      targetType: 'CLIENT',
      targetId: clientId,
      title: 'Retrait effectue',
      message: `Retrait de ${amount.toLocaleString('fr-FR')} FCFA sur votre compte ${accountNumber}.`,
      channel: 'SMS',
    });
  }

  async notifyCreditApproved(clientId: string, amount: number) {
    return this.create({
      targetType: 'CLIENT',
      targetId: clientId,
      title: 'Credit approuve',
      message: `Votre demande de credit de ${amount.toLocaleString('fr-FR')} FCFA a ete approuvee.`,
      channel: 'SMS',
    });
  }

  async notifyCreditDue(clientId: string, amount: number, dueDate: string) {
    return this.create({
      targetType: 'CLIENT',
      targetId: clientId,
      title: 'Echeance de credit',
      message: `Rappel: echeance de ${amount.toLocaleString('fr-FR')} FCFA le ${dueDate}.`,
      channel: 'SMS',
    });
  }

  // Notifications pour le staff
  async notifyStaff(userId: string, title: string, msg: string) {
    return this.create({
      targetType: 'USER',
      targetId: userId,
      title,
      message: msg,
      channel: 'SYSTEM',
    });
  }
}
