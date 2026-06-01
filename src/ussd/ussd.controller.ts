import {
  Controller,
  Post,
  Body,
  Header,
  Logger,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { UssdService } from './ussd.service';

@ApiTags('USSD')
@Controller('ussd')
export class UssdController {
  private readonly logger = new Logger(UssdController.name);

  constructor(
    private readonly ussdService: UssdService,
    private readonly configService: ConfigService,
  ) {}

  @Post('callback')
  @ApiOperation({ summary: "Webhook USSD Africa's Talking" })
  @Header('Content-Type', 'text/plain')
  async handleUssd(
    @Body('sessionId') sessionId: string,
    @Body('serviceCode') serviceCode: string,
    @Body('phoneNumber') phoneNumber: string,
    @Body('text') text: string,
    @Headers('x-at-webhook-secret') webhookSecret: string,
  ): Promise<string> {
    // Validation webhook en production
    const expectedSecret = this.configService.get<string>('AT_WEBHOOK_SECRET');
    if (expectedSecret && webhookSecret !== expectedSecret) {
      this.logger.warn(
        `Requete USSD rejetee - secret invalide depuis ${phoneNumber}`,
      );
      throw new ForbiddenException('Webhook non autorise');
    }

    this.logger.log(
      `USSD [${sessionId}] phone=${phoneNumber} text="${text || ''}"`,
    );

    try {
      const response = await this.ussdService.handleRequest(
        sessionId,
        phoneNumber,
        text || '',
      );
      this.logger.log(`USSD [${sessionId}] -> ${response.substring(0, 50)}...`);
      return response;
    } catch (error) {
      this.logger.error(`USSD [${sessionId}] ERREUR: ${error.message}`);
      return 'END Une erreur est survenue. Veuillez reessayer plus tard.';
    }
  }
}
