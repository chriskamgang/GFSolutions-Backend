import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CheckbooksService } from './checkbooks.service';
import {
  RequestCheckbookDto,
  EmitChequeDto,
  OppositionChequeDto,
  EncaisserChequeDto,
  RetraitChequeDto,
} from './dto/checkbook.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Chequiers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('checkbooks')
export class CheckbooksController {
  constructor(private checkbooksService: CheckbooksService) {}

  @Get('find-cheque/:chequeNumber')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Rechercher un cheque par son numero' })
  findChequeByNumber(@Param('chequeNumber') chequeNumber: string) {
    return this.checkbooksService.findChequeByNumber(chequeNumber);
  }

  @Get('account-info/:accountId')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Recuperer les infos du compte, client et chequiers pour verification cheque' })
  getAccountInfo(@Param('accountId') accountId: string) {
    return this.checkbooksService.getAccountInfo(accountId);
  }

  @Post()
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Demander un nouveau chequier' })
  requestCheckbook(@Body() dto: RequestCheckbookDto, @CurrentUser() user: any) {
    return this.checkbooksService.requestCheckbook(dto, user.sub);
  }

  @Get()
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Lister les chequiers d\'un compte' })
  @ApiQuery({ name: 'accountId', required: true })
  getCheckbooks(@Query('accountId') accountId: string) {
    return this.checkbooksService.getCheckbooks(accountId);
  }

  @Get('cheques')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Lister les cheques (pagine)' })
  @ApiQuery({ name: 'checkbookId', required: false })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['DISPONIBLE', 'EMIS', 'ENCAISSE', 'OPPOSITION'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getCheques(
    @Query('checkbookId') checkbookId?: string,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.checkbooksService.getCheques({
      checkbookId,
      accountId,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('registre')
  @Permissions('TRANSACTIONS:READ')
  @ApiOperation({ summary: 'Registre des cheques' })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['DISPONIBLE', 'EMIS', 'ENCAISSE', 'OPPOSITION'] })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getRegistre(
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.checkbooksService.getRegistre({
      accountId,
      status,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Patch('cheques/:id/emit')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Emettre un cheque' })
  emitCheque(
    @Param('id') id: string,
    @Body() dto: EmitChequeDto,
    @CurrentUser() user: any,
  ) {
    return this.checkbooksService.emitCheque(id, dto, user.sub);
  }

  @Patch('cheques/:id/encaisser')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Encaisser un cheque' })
  encaisserCheque(
    @Param('id') id: string,
    @Body() dto: EncaisserChequeDto,
    @CurrentUser() user: any,
  ) {
    return this.checkbooksService.encaisserCheque(id, dto, user.sub);
  }

  @Patch('cheques/:id/retrait')
  @Permissions('TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Retrait especes par cheque' })
  retraitCheque(
    @Param('id') id: string,
    @Body() dto: RetraitChequeDto,
    @CurrentUser() user: any,
  ) {
    // Retrait = encaisser sans compte destinataire
    return this.checkbooksService.encaisserCheque(id, { chequeNumber: dto.chequeNumber }, user.sub);
  }

  @Patch('cheques/:id/opposition')
  @Permissions('TRANSACTIONS:UPDATE')
  @ApiOperation({ summary: 'Mettre un cheque en opposition' })
  opposeCheque(
    @Param('id') id: string,
    @Body() dto: OppositionChequeDto,
    @CurrentUser() user: any,
  ) {
    return this.checkbooksService.opposeCheque(id, dto, user.sub);
  }

  @Patch(':id/opposition')
  @Permissions('TRANSACTIONS:UPDATE')
  @ApiOperation({ summary: 'Mettre tout un chequier en opposition' })
  opposeCheckbook(
    @Param('id') id: string,
    @Body() dto: OppositionChequeDto,
    @CurrentUser() user: any,
  ) {
    return this.checkbooksService.opposeCheckbook(id, dto.motif, user.sub);
  }
}
