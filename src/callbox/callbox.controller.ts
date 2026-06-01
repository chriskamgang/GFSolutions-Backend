import {
  Controller, Post, Get, Patch, Body, Param, Query,
  UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CallboxService } from './callbox.service';
import {
  RegisterCallboxDto, CallboxLoginDto, CallboxDepositDto,
  CallboxWithdrawalDto, CallboxTransferDto, FloatTopupDto,
  UpdateCommissionConfigDto,
} from './dto/callbox.dto';

@ApiTags('callbox')
@Controller('callbox')
export class CallboxController {
  constructor(private readonly callboxService: CallboxService) {}

  // ==================== AUTH PUBLIC ====================

  @Post('register')
  @ApiOperation({ summary: 'Inscription callbox (en attente approbation)' })
  register(@Body() dto: RegisterCallboxDto) {
    return this.callboxService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Connexion callbox' })
  login(@Body() dto: CallboxLoginDto) {
    return this.callboxService.login(dto);
  }

  // ==================== CALLBOX OPERATIONS (jwt-callbox) ====================

  @Get('me')
  @UseGuards(AuthGuard('jwt-callbox'))
  @ApiBearerAuth()
  getMe(@Request() req: any) {
    return this.callboxService.getMe(req.user.callboxId);
  }

  @Get('stats')
  @UseGuards(AuthGuard('jwt-callbox'))
  @ApiBearerAuth()
  getStats(@Request() req: any) {
    return this.callboxService.getStats(req.user.callboxId);
  }

  @Get('transactions')
  @UseGuards(AuthGuard('jwt-callbox'))
  @ApiBearerAuth()
  getTransactions(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.callboxService.getTransactions(req.user.callboxId, { page, limit });
  }

  @Get('lookup')
  @UseGuards(AuthGuard('jwt-callbox'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Identifier un client par QR code ou numéro de compte' })
  lookup(@Query('identifier') identifier: string) {
    return this.callboxService.lookupByQrOrAccount(identifier);
  }

  @Post('deposit')
  @UseGuards(AuthGuard('jwt-callbox'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dépôt espèces — client vers son compte' })
  deposit(@Request() req: any, @Body() dto: CallboxDepositDto) {
    return this.callboxService.deposit(req.user.callboxId, dto);
  }

  @Post('withdrawal')
  @UseGuards(AuthGuard('jwt-callbox'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retrait espèces — compte client vers espèces' })
  withdrawal(@Request() req: any, @Body() dto: CallboxWithdrawalDto) {
    return this.callboxService.withdrawal(req.user.callboxId, dto);
  }

  @Post('transfer')
  @UseGuards(AuthGuard('jwt-callbox'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Transfert P2P via QR code destinataire' })
  transfer(@Request() req: any, @Body() dto: CallboxTransferDto) {
    return this.callboxService.transfer(req.user.callboxId, req.user.agencyId, dto);
  }

  // ==================== ADMIN (jwt staff) ====================

  @Post('admin/register')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin/Agent crée un compte callbox' })
  adminRegister(@Body() dto: RegisterCallboxDto, @Request() req: any) {
    return this.callboxService.register(dto, req.user.sub);
  }

  @Get('admin/list')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  findAll(
    @Query('status') status?: string,
    @Query('agencyId') agencyId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.callboxService.findAll({ status, agencyId, page, limit });
  }

  @Get('admin/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  findOne(@Param('id') id: string) {
    return this.callboxService.findOne(id);
  }

  @Patch('admin/:id/approve')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  approve(@Param('id') id: string, @Request() req: any) {
    return this.callboxService.approve(id, req.user.sub);
  }

  @Patch('admin/:id/reject')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  reject(@Param('id') id: string, @Request() req: any) {
    return this.callboxService.reject(id, req.user.sub);
  }

  @Patch('admin/:id/suspend')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  suspend(@Param('id') id: string) {
    return this.callboxService.suspend(id);
  }

  @Post('admin/float-topup')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recharger le float d\'un callbox' })
  floatTopup(@Body() dto: FloatTopupDto, @Request() req: any) {
    return this.callboxService.floatTopup(dto, req.user.sub);
  }

  @Get('admin/commission-configs')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  getCommissionConfigs() {
    return this.callboxService.getCommissionConfigs();
  }

  @Patch('admin/commission-configs/:type')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  upsertCommissionConfig(
    @Param('type') type: string,
    @Body() dto: UpdateCommissionConfigDto,
  ) {
    return this.callboxService.upsertCommissionConfig(type, dto);
  }
}
