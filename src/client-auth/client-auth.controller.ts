import { Controller, Post, Get, Patch, Body, UseGuards, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ClientAuthService } from './client-auth.service';
import {
  ClientLoginDto,
  ClientRegisterPinDto,
  ClientChangePinDto,
  ClientChangePasswordDto,
} from './dto/client-auth.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Auth Client Mobile')
@Controller('client-auth')
export class ClientAuthController {
  constructor(private clientAuthService: ClientAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Connexion client (telephone/code adherent + mot de passe/PIN)' })
  login(@Body() dto: ClientLoginDto) {
    return this.clientAuthService.login(dto);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deconnexion client' })
  logout(@CurrentUser('sub') clientId: string) {
    return this.clientAuthService.logout(clientId);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil du client connecte' })
  getProfile(@CurrentUser('sub') clientId: string) {
    return this.clientAuthService.getProfile(clientId);
  }

  @Post('register-credentials')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enregistrer PIN + mot de passe (premiere activation)' })
  registerCredentials(
    @CurrentUser('sub') clientId: string,
    @Body() dto: ClientRegisterPinDto,
  ) {
    return this.clientAuthService.registerCredentials(clientId, dto);
  }

  @Patch('change-pin')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer le code PIN' })
  changePin(
    @CurrentUser('sub') clientId: string,
    @Body() dto: ClientChangePinDto,
  ) {
    return this.clientAuthService.changePin(clientId, dto);
  }

  @Patch('change-password')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer le mot de passe' })
  changePassword(
    @CurrentUser('sub') clientId: string,
    @Body() dto: ClientChangePasswordDto,
  ) {
    return this.clientAuthService.changePassword(clientId, dto);
  }

  // === Endpoints donnees client ===

  @Get('accounts')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes comptes' })
  getMyAccounts(@CurrentUser('sub') clientId: string) {
    return this.clientAuthService.getMyAccounts(clientId);
  }

  @Get('transactions')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes transactions' })
  getMyTransactions(
    @CurrentUser('sub') clientId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.clientAuthService.getMyTransactions(clientId, {
      limit: limit ? parseInt(limit) : undefined,
      page: page ? parseInt(page) : undefined,
      accountId,
    });
  }

  @Get('credits')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes credits' })
  getMyCredits(@CurrentUser('sub') clientId: string) {
    return this.clientAuthService.getMyCredits(clientId);
  }

  @Get('notifications')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes notifications' })
  getMyNotifications(
    @CurrentUser('sub') clientId: string,
    @Query('limit') limit?: string,
  ) {
    return this.clientAuthService.getMyNotifications(clientId, limit ? parseInt(limit) : 30);
  }

  @Post('transfer')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Virement GFS entre comptes (initié par le client)' })
  transfer(
    @CurrentUser('sub') clientId: string,
    @Body() dto: { fromAccountId: string; toAccountNumber: string; amount: number; description?: string },
  ) {
    return this.clientAuthService.transfer(clientId, dto);
  }

  @Patch('notifications/read')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marquer toutes les notifications comme lues' })
  markNotificationsRead(@CurrentUser('sub') clientId: string) {
    return this.clientAuthService.markNotificationsRead(clientId);
  }

  // === Endpoints remboursement echeances credit ===

  @Get('credits/:creditId/repayments')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes echeances pour un credit' })
  getMyRepayments(
    @CurrentUser('sub') clientId: string,
    @Param('creditId') creditId: string,
  ) {
    return this.clientAuthService.getMyRepayments(clientId, creditId);
  }

  @Post('credits/:creditId/repay')
  @UseGuards(AuthGuard('jwt-client'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Payer une echeance de credit' })
  payMyRepayment(
    @CurrentUser('sub') clientId: string,
    @Body('repaymentId') repaymentId: string,
    @Body('accountId') accountId: string,
  ) {
    return this.clientAuthService.payMyRepayment(clientId, repaymentId, accountId);
  }
}
