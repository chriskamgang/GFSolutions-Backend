import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('WhatsApp')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Get('status')
  @Permissions('SETTINGS:READ')
  @ApiOperation({ summary: 'Statut de la connexion WhatsApp + QR Code si necessaire' })
  getStatus() {
    return this.whatsappService.getStatus();
  }

  @Post('reconnect')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Forcer une nouvelle connexion WhatsApp (regenerer le QR)' })
  async reconnect() {
    await this.whatsappService.reconnect();
    return { success: true, message: 'Reconnexion lancee, verifiez le statut dans quelques secondes' };
  }

  @Post('disconnect')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Deconnecter WhatsApp et effacer la session' })
  async disconnect() {
    await this.whatsappService.disconnect();
    return { success: true, message: 'WhatsApp deconnecte et session effacee' };
  }

  @Post('test')
  @Permissions('SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Envoyer un message WhatsApp de test' })
  async test(@Body() body: { phone: string }) {
    const sent = await this.whatsappService.sendMessage(
      body.phone,
      '✅ Test WhatsApp GFS — Votre configuration fonctionne correctement.\n\n_Global Financial Solution_',
    );
    return { success: sent, message: sent ? 'Message envoye' : 'Echec — verifiez que WhatsApp est connecte' };
  }
}
