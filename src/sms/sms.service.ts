import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiUrl = 'https://smsvas.com/bulk/public/index.php/api/v1/sendsms';
  private readonly creditUrl = 'https://smsvas.com/bulk/public/index.php/api/v1/smscredit';
  private readonly user: string;
  private readonly password: string;
  private readonly senderId: string;
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    this.user = this.configService.get<string>('NEXAH_SMS_USER', '');
    this.password = this.configService.get<string>('NEXAH_SMS_PASSWORD', '');
    this.senderId = this.configService.get<string>('NEXAH_SMS_SENDER_ID', 'MicroFin');
    this.enabled = !!this.user && !!this.password;

    if (!this.enabled) {
      this.logger.warn('NEXAH SMS desactive : NEXAH_SMS_USER ou NEXAH_SMS_PASSWORD manquant');
    }
  }

  /**
   * Formate un numero camerounais pour NEXAH (237XXXXXXXXX sans +)
   */
  private formatPhone(phone: string): string {
    const clean = phone.replace(/[\s\-\.+]/g, '');
    if (clean.startsWith('237')) return clean;
    if (clean.startsWith('6') || clean.startsWith('2')) return `237${clean}`;
    return clean;
  }

  /**
   * Envoie un SMS via NEXAH API
   */
  async send(phone: string, message: string): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug(`[SMS SIMULE] -> ${phone}: ${message}`);
      return true;
    }

    try {
      const body = {
        user: this.user,
        password: this.password,
        senderid: this.senderId,
        sms: message,
        mobiles: this.formatPhone(phone),
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      this.logger.log(`SMS envoye a ${phone} - reponse: ${JSON.stringify(data)}`);
      return true;
    } catch (error) {
      this.logger.error(`Echec envoi SMS a ${phone}: ${error.message}`);
      return false;
    }
  }

  /**
   * Verifie le solde SMS NEXAH
   */
  async checkCredit(): Promise<any> {
    if (!this.enabled) return { enabled: false, message: 'SMS non configure' };

    try {
      const response = await fetch(this.creditUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: this.user, password: this.password }),
      });
      return await response.json();
    } catch (error) {
      this.logger.error(`Echec verification credit SMS: ${error.message}`);
      return { error: error.message };
    }
  }

  // ==================== TEMPLATES SMS ====================

  private formatDate(): string {
    const now = new Date();
    const d = now.getDate().toString().padStart(2, '0');
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  }

  private formatAmount(amount: number): string {
    return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  async sendDepositAlert(phone: string, accountNumber: string, amount: number, balance: number): Promise<boolean> {
    const msg = `Cher(e) client(e), votre compte NO ${accountNumber} a ete CREDITE de ${this.formatAmount(amount)} FCFA en date du ${this.formatDate()}, votre nouveau solde actuel est de ${this.formatAmount(balance)} FCFA`;
    return this.send(phone, msg);
  }

  async sendWithdrawalAlert(phone: string, accountNumber: string, amount: number, balance: number): Promise<boolean> {
    const msg = `Cher(e) client(e), votre compte NO ${accountNumber} a ete DEBITE de ${this.formatAmount(amount)} FCFA en date du ${this.formatDate()}, votre nouveau solde actuel est de ${this.formatAmount(balance)} FCFA`;
    return this.send(phone, msg);
  }

  async sendTransferSentAlert(phone: string, accountNumber: string, amount: number, balance: number): Promise<boolean> {
    const msg = `Cher(e) client(e), votre compte NO ${accountNumber} a ete DEBITE de ${this.formatAmount(amount)} FCFA en date du ${this.formatDate()}, votre nouveau solde actuel est de ${this.formatAmount(balance)} FCFA`;
    return this.send(phone, msg);
  }

  async sendTransferReceivedAlert(phone: string, accountNumber: string, amount: number, balance: number): Promise<boolean> {
    const msg = `Cher(e) client(e), votre compte NO ${accountNumber} a ete CREDITE de ${this.formatAmount(amount)} FCFA en date du ${this.formatDate()}, votre nouveau solde actuel est de ${this.formatAmount(balance)} FCFA`;
    return this.send(phone, msg);
  }

  async sendCredentials(phone: string, clientName: string, clientNumber: string, password: string): Promise<boolean> {
    const msg = `Cher(e) ${clientName}, bienvenue Global Financial Solution! Votre compte est actif. Identifiant: ${clientNumber} et acces: ${password} pour vous connecter sur l'app.`;
    return this.send(phone, msg);
  }
}
