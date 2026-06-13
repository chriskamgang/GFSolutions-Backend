import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('Entreprises & Salaires')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Post()
  @Permissions('COMPANIES:CREATE')
  @ApiOperation({ summary: 'Enregistrer une entreprise' })
  create(
    @Body()
    body: {
      name: string;
      registrationNumber: string;
      address: string;
      city: string;
      phone: string;
      email?: string;
      contactPerson: string;
    },
  ) {
    return this.companiesService.create(body);
  }

  @Get()
  @Permissions('COMPANIES:READ')
  @ApiOperation({ summary: 'Lister les entreprises' })
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  @Permissions('COMPANIES:READ')
  @ApiOperation({ summary: 'Detail d\'une entreprise' })
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Get(':id/employees')
  @Permissions('COMPANIES:READ')
  @ApiOperation({ summary: 'Employes d\'une entreprise' })
  getEmployees(@Param('id') id: string) {
    return this.companiesService.getEmployees(id);
  }

  @Post(':id/employees')
  @Permissions('COMPANIES:CREATE')
  @ApiOperation({ summary: 'Ajouter un employe (client existant) a une entreprise' })
  addEmployee(
    @Param('id') companyId: string,
    @Body() body: { clientId?: string; phone?: string },
  ) {
    return this.companiesService.addEmployee(companyId, body);
  }

  @Delete(':id/employees/:clientId')
  @Permissions('COMPANIES:CREATE')
  @ApiOperation({ summary: 'Retirer un employe d\'une entreprise' })
  removeEmployee(
    @Param('id') companyId: string,
    @Param('clientId') clientId: string,
  ) {
    return this.companiesService.removeEmployee(companyId, clientId);
  }

  @Post(':id/salary-batch')
  @Permissions('COMPANIES:CREATE', 'TRANSACTIONS:CREATE')
  @ApiOperation({ summary: 'Effectuer un virement de salaires' })
  processSalaryBatch(
    @Param('id') companyId: string,
    @Body()
    body: {
      payments: { employeeName: string; employeePhone: string; amount: number }[];
    },
  ) {
    return this.companiesService.processSalaryBatch({
      companyId,
      payments: body.payments,
    });
  }

  @Get(':id/salary-history')
  @Permissions('COMPANIES:READ')
  @ApiOperation({ summary: 'Historique des virements de salaires' })
  getSalaryHistory(@Param('id') id: string) {
    return this.companiesService.getSalaryHistory(id);
  }
}
