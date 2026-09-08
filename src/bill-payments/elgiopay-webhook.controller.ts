import { Controller, Post, Body, Headers, Logger, HttpCode, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@ApiTags('Webhooks')
@Controller('webhooks/elgiopay')
export class ElgioPayWebhookController {
  private readonly logger = new Logger(ElgioPayWebhookController.name);

  constructor(private prisma: PrismaService) {}

  private async getSigningSecret(): Promise<string> {
    try {
      const setting = await this.prisma.setting.findUnique({
        where: { key: 'elgiopay_webhook_secret' },
      });
      return setting?.value || process.env.ELGIOPAY_WEBHOOK_SECRET || '';
    } catch {
      return process.env.ELGIOPAY_WEBHOOK_SECRET || '';
    }
  }

  private verifySignature(payload: string, signature: string, secret: string): boolean {
    if (!secret) return true; // Skip verification if no secret configured
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    // Support both raw hex and prefixed formats
    const sig = signature.replace(/^sha256=/, '').replace(/^whsec_/, '');
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(sig, 'hex'));
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook ElgioPay - Reception des notifications de paiement' })
  async handleWebhook(
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
  ) {
    this.logger.log(`ElgioPay webhook received: ${JSON.stringify(payload)}`);

    // Verify HMAC signature if signing secret is configured
    const signature = headers['x-elgiopay-signature'] || headers['x-webhook-signature'] || '';
    const signingSecret = await this.getSigningSecret();
    if (signingSecret && signature) {
      try {
        const isValid = this.verifySignature(JSON.stringify(payload), signature, signingSecret);
        if (!isValid) {
          this.logger.warn('ElgioPay webhook signature verification FAILED');
          throw new ForbiddenException('Invalid webhook signature');
        }
        this.logger.log('ElgioPay webhook signature verified OK');
      } catch (e) {
        if (e instanceof ForbiddenException) throw e;
        this.logger.warn(`Signature verification error: ${e.message}`);
      }
    }

    // Log the webhook for debugging
    try {
      await this.prisma.setting.upsert({
        where: { key: 'elgiopay_last_webhook' },
        update: { value: JSON.stringify({ payload, receivedAt: new Date().toISOString() }) },
        create: {
          key: 'elgiopay_last_webhook',
          value: JSON.stringify({ payload, receivedAt: new Date().toISOString() }),
          category: 'elgiopay',
          description: 'Dernier webhook ElgioPay recu',
        },
      });
    } catch (e) {
      this.logger.warn('Could not save webhook log to DB');
    }

    // Extract event type and data from payload
    const event = payload.event || payload.type || payload.status || '';
    const reference = payload.reference || payload.transaction_id || payload.id || '';
    const status = payload.status || payload.payment_status || '';

    this.logger.log(`ElgioPay event: ${event}, reference: ${reference}, status: ${status}`);

    // Update bill payment status if we can match the reference
    if (reference) {
      try {
        // Try to find a matching bill payment by checking the notes field for ElgioPay reference
        const payments = await this.prisma.billPayment.findMany({
          where: {
            notes: { contains: reference },
            reference: { startsWith: 'ELGIO-' },
          },
          take: 1,
        });

        if (payments.length > 0) {
          const payment = payments[0];
          const newStatus = this.mapElgioPayStatus(status);

          if (newStatus && newStatus !== payment.status) {
            await this.prisma.billPayment.update({
              where: { id: payment.id },
              data: {
                status: newStatus,
                notes: payment.notes + ` | [Webhook] ${event}: ${status} @ ${new Date().toISOString()}`,
              },
            });
            this.logger.log(`Updated bill payment ${payment.reference} status to ${newStatus}`);
          }
        }
      } catch (e) {
        this.logger.error(`Error processing webhook: ${e.message}`);
      }
    }

    // Always return 200 to acknowledge receipt
    return { received: true, timestamp: new Date().toISOString() };
  }

  private mapElgioPayStatus(status: string): string | null {
    const s = (status || '').toLowerCase();
    if (s === 'successful' || s === 'success' || s === 'completed' || s === 'paid') return 'COLLECTED';
    if (s === 'failed' || s === 'error' || s === 'rejected') return 'CANCELLED';
    if (s === 'reversed' || s === 'refunded') return 'REVERSED';
    return null;
  }
}
