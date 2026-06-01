import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto, AddMandataireDto } from './dto/client.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Post()
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Enregistrer un nouveau client (physique ou morale)' })
  create(@Body() dto: CreateClientDto, @CurrentUser() user: any) {
    // Si agencyId pas fourni, prendre celui de l'utilisateur connecte
    if (!dto.agencyId) {
      dto.agencyId = user.agencyId;
    }
    return this.clientsService.create(dto, user.sub);
  }

  @Post('import')
  @Permissions('CLIENTS:CREATE')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importer des clients depuis un fichier CSV' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  async importClients(@UploadedFile() file: any, @CurrentUser() user: any) {
    if (!file) {
      throw new BadRequestException('Fichier CSV requis');
    }

    const content = file.buffer.toString('utf-8');
    const lines = content.split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) {
      throw new BadRequestException('Le fichier doit contenir au moins un en-tete et une ligne de donnees');
    }

    // Parser CSV (separator: , or ;)
    const separator = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(separator).map((h: string) => h.trim().replace(/^["']|["']$/g, ''));

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(separator).map((v: string) => v.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h: string, idx: number) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }

    return this.clientsService.importClients(rows, user.sub);
  }

  @Post('merge')
  @Permissions('CLIENTS:UPDATE')
  @ApiOperation({ summary: 'Fusionner deux clients doublons (le secondaire est absorbe par le primaire)' })
  mergeClients(
    @Body() dto: { primaryId: string; secondaryId: string },
    @CurrentUser() user: any,
  ) {
    return this.clientsService.mergeClients(dto.primaryId, dto.secondaryId, user.sub);
  }

  @Get()
  @Permissions('CLIENTS:READ')
  @ApiOperation({ summary: 'Lister les clients' })
  @ApiQuery({ name: 'agencyId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'clientType', required: false, enum: ['PHYSIQUE', 'MORALE'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('agencyId') agencyId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('clientType') clientType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.clientsService.findAll({
      agencyId,
      status,
      search,
      clientType,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Post('check-duplicate')
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Verifier les doublons avant creation' })
  checkDuplicate(@Body() dto: { phone?: string; idDocumentNumber?: string; firstName?: string; lastName?: string; dateOfBirth?: string; numeroEnregistrement?: string }) {
    return this.clientsService.checkDuplicate(dto);
  }

  @Get('alerts/documents')
  @Permissions('CLIENTS:READ')
  @ApiOperation({ summary: 'Alertes : pieces expirees, KYC incomplet' })
  getDocumentAlerts() {
    return this.clientsService.getExpiredDocuments();
  }

  @Get('export')
  @Permissions('CLIENTS:READ')
  @ApiOperation({ summary: 'Exporter la liste des clients (JSON)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'agencyId', required: false })
  @ApiQuery({ name: 'clientType', required: false })
  async export(
    @Query('status') status?: string,
    @Query('agencyId') agencyId?: string,
    @Query('clientType') clientType?: string,
  ) {
    return this.clientsService.exportAll({ status, agencyId, clientType });
  }

  @Get(':id')
  @Permissions('CLIENTS:READ')
  @ApiOperation({ summary: 'Voir un client (vue 360 avec mandataires)' })
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('CLIENTS:UPDATE')
  @ApiOperation({ summary: 'Modifier un client' })
  update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() user: any) {
    return this.clientsService.update(id, dto, user.sub);
  }

  @Patch(':id/status')
  @Permissions('CLIENTS:UPDATE')
  @ApiOperation({ summary: 'Changer le statut d\'un client' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED',
    @CurrentUser() user: any,
  ) {
    return this.clientsService.updateStatus(id, status, user.sub);
  }

  @Patch(':id/verify-kyc')
  @Permissions('CLIENTS:UPDATE')
  @ApiOperation({ summary: 'Valider le KYC d\'un client' })
  verifyKyc(@Param('id') id: string, @CurrentUser() user: any) {
    return this.clientsService.verifyKyc(id, user.sub);
  }

  @Post(':id/calculate-kyc-score')
  @Permissions('CLIENTS:READ')
  @ApiOperation({ summary: 'Calculer/recalculer le score KYC d\'un client' })
  calculateKycScore(@Param('id') id: string) {
    return this.clientsService.recalculateKycScore(id);
  }

  // ==================== MANDATAIRES ====================

  @Post(':id/mandataires')
  @Permissions('CLIENTS:CREATE')
  @ApiOperation({ summary: 'Ajouter un mandataire a une personne morale' })
  addMandataire(
    @Param('id') id: string,
    @Body() dto: AddMandataireDto,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.addMandataire(id, dto, user.sub);
  }

  @Get(':id/mandataires')
  @Permissions('CLIENTS:READ')
  @ApiOperation({ summary: 'Lister les mandataires d\'une personne morale' })
  getMandataires(@Param('id') id: string) {
    return this.clientsService.getMandataires(id);
  }

  @Patch('mandataires/:mandataireId')
  @Permissions('CLIENTS:UPDATE')
  @ApiOperation({ summary: 'Modifier un mandataire' })
  updateMandataire(
    @Param('mandataireId') mandataireId: string,
    @Body() dto: Partial<AddMandataireDto>,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.updateMandataire(mandataireId, dto, user.sub);
  }

  @Delete('mandataires/:mandataireId')
  @Permissions('CLIENTS:DELETE')
  @ApiOperation({ summary: 'Retirer un mandataire' })
  removeMandataire(@Param('mandataireId') mandataireId: string, @CurrentUser() user: any) {
    return this.clientsService.removeMandataire(mandataireId, user.sub);
  }
}
