import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as QRCode from 'qrcode';

type WaStatus = 'disconnected' | 'connecting' | 'qr_pending' | 'connected';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly authFolder = path.join(process.cwd(), 'whatsapp-auth');

  private sock: any = null;
  private status: WaStatus = 'disconnected';
  private qrBase64: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  onModuleInit() {
    fs.mkdirSync(this.authFolder, { recursive: true });
    this.connect();
  }

  onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.sock?.end(undefined);
  }

  // ===================== CONNEXION =====================

  async connect() {
    try {
      // Import dynamique pour compatibilite ESM/CJS
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
        Browsers,
      } = await import('@whiskeysockets/baileys') as any;

      const { Boom } = await import('@hapi/boom') as any;

      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);
      const { version } = await fetchLatestBaileysVersion();

      this.status = 'connecting';
      this.logger.log(`Connexion WhatsApp (Baileys v${version.join('.')})`);

      this.sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.ubuntu('GFS Backend'),
        printQRInTerminal: false,
        syncFullHistory: false,
        logger: {
          level: 'silent',
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: (msg: any) => this.logger.warn('[Baileys] ' + (typeof msg === 'string' ? msg : JSON.stringify(msg))),
          error: (msg: any) => this.logger.error('[Baileys] ' + (typeof msg === 'string' ? msg : JSON.stringify(msg))),
          fatal: () => {},
          child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({}) }),
        },
      });

      // QR Code
      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.status = 'qr_pending';
          this.qrBase64 = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          this.logger.log('QR Code WhatsApp disponible — scannez depuis le dashboard');
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.qrBase64 = null;
          this.reconnectAttempts = 0;
          this.logger.log('WhatsApp connecte avec succes');
        }

        if (connection === 'close') {
          const reason = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = reason !== DisconnectReason.loggedOut;

          this.logger.warn(`WhatsApp deconnecte (raison: ${reason}), reconnexion: ${shouldReconnect}`);

          if (reason === DisconnectReason.loggedOut) {
            this.status = 'disconnected';
            this.qrBase64 = null;
            // Supprimer les credentials sauvegardes
            fs.rmSync(this.authFolder, { recursive: true, force: true });
            fs.mkdirSync(this.authFolder, { recursive: true });
            this.scheduleReconnect();
          } else if (shouldReconnect) {
            this.status = 'disconnected';
            this.scheduleReconnect();
          } else {
            this.status = 'disconnected';
          }
        }
      });

      // Sauvegarder les credentials
      this.sock.ev.on('creds.update', saveCreds);

    } catch (err: any) {
      this.logger.error('Erreur demarrage WhatsApp : ' + err.message);
      this.status = 'disconnected';
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;
    const delay = Math.min(5000 * this.reconnectAttempts, 60000); // max 60s
    this.logger.log(`Nouvelle tentative de connexion WA dans ${delay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // ===================== ENVOI MESSAGE =====================

  async sendMessage(phone: string, text: string): Promise<boolean> {
    if (this.status !== 'connected' || !this.sock) {
      this.logger.warn(`[WA] Non connecte — message non envoye a ${phone}`);
      return false;
    }

    try {
      // Format JID WhatsApp : 237XXXXXXXXX@s.whatsapp.net
      const jid = this.formatJid(phone);
      await this.sock.sendMessage(jid, { text });
      this.logger.log(`[WA] Message envoye a ${phone}`);
      return true;
    } catch (err: any) {
      this.logger.error(`[WA] Erreur envoi a ${phone}: ${err.message}`);
      return false;
    }
  }

  private formatJid(phone: string): string {
    const clean = phone.replace(/[\s\-\.+]/g, '');
    const withCountry = clean.startsWith('237') ? clean : `237${clean.slice(-9)}`;
    return `${withCountry}@s.whatsapp.net`;
  }

  // ===================== TEMPLATES =====================

  async sendCredentials(phone: string, name: string, clientNumber: string, password: string): Promise<boolean> {
    const text =
      `*Bienvenue chez GFS !* 🎉\n\n` +
      `Cher(e) *${name}*,\n\n` +
      `Votre compte est activé. Voici vos identifiants de connexion pour l'application mobile :\n\n` +
      `📱 *Identifiant :* ${clientNumber}\n` +
      `🔑 *Mot de passe :* ${password}\n\n` +
      `Téléchargez l'application GFS et connectez-vous.\n` +
      `_Changez votre mot de passe après la première connexion._\n\n` +
      `*Global Financial Solution* — Votre partenaire financier 🏦`;
    return this.sendMessage(phone, text);
  }

  async sendDepositAlert(phone: string, accountNumber: string, amount: number, balance: number): Promise<boolean> {
    const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
    const text =
      `✅ *Dépôt effectué*\n\n` +
      `Compte : *${accountNumber}*\n` +
      `Montant crédité : *${fmt(amount)} FCFA*\n` +
      `Nouveau solde : *${fmt(balance)} FCFA*\n\n` +
      `_Global Financial Solution_`;
    return this.sendMessage(phone, text);
  }

  async sendWithdrawalAlert(phone: string, accountNumber: string, amount: number, balance: number): Promise<boolean> {
    const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
    const text =
      `🔔 *Retrait effectué*\n\n` +
      `Compte : *${accountNumber}*\n` +
      `Montant débité : *${fmt(amount)} FCFA*\n` +
      `Nouveau solde : *${fmt(balance)} FCFA*\n\n` +
      `_Global Financial Solution_`;
    return this.sendMessage(phone, text);
  }

  async sendTransferAlert(phone: string, accountNumber: string, amount: number, balance: number, direction: 'sent' | 'received'): Promise<boolean> {
    const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
    const text = direction === 'sent'
      ? `💸 *Virement envoyé*\n\nCompte : *${accountNumber}*\nMontant : *${fmt(amount)} FCFA*\nSolde restant : *${fmt(balance)} FCFA*\n\n_Global Financial Solution_`
      : `💰 *Virement reçu*\n\nCompte : *${accountNumber}*\nMontant reçu : *${fmt(amount)} FCFA*\nNouveau solde : *${fmt(balance)} FCFA*\n\n_Global Financial Solution_`;
    return this.sendMessage(phone, text);
  }

  // ===================== STATUS & CONTROLE =====================

  getStatus(): { status: WaStatus; qrCode: string | null; message: string } {
    const messages: Record<WaStatus, string> = {
      disconnected: 'Non connecte',
      connecting: 'Connexion en cours...',
      qr_pending: 'Scannez le QR Code avec votre telephone WhatsApp',
      connected: 'Connecte',
    };
    return {
      status: this.status,
      qrCode: this.qrBase64,
      message: messages[this.status],
    };
  }

  async disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.sock?.end(undefined);
    this.sock = null;
    this.status = 'disconnected';
    this.qrBase64 = null;
    fs.rmSync(this.authFolder, { recursive: true, force: true });
    fs.mkdirSync(this.authFolder, { recursive: true });
    this.logger.log('WhatsApp deconnecte et session effacee');
  }

  async reconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.sock?.end(undefined);
    this.sock = null;
    this.status = 'disconnected';
    this.qrBase64 = null;
    await this.connect();
  }
}
