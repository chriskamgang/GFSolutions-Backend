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
import { SavingsGoalsService } from './savings-goals.service';
import { CreateSavingsGoalDto, UpdateSavingsGoalDto, ContributeToGoalDto } from './dto/savings-goal.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Epargne Objectif')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('savings-goals')
export class SavingsGoalsController {
  constructor(private savingsGoalsService: SavingsGoalsService) {}

  @Post()
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Creer un objectif d\'epargne' })
  create(
    @Body() dto: CreateSavingsGoalDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.savingsGoalsService.create(dto, userId);
  }

  @Get()
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Lister les objectifs d\'epargne' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'isCompleted', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('clientId') clientId?: string,
    @Query('isCompleted') isCompleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.savingsGoalsService.findAll({
      clientId,
      isCompleted: isCompleted !== undefined ? isCompleted === 'true' : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get(':id')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Detail d\'un objectif d\'epargne' })
  findOne(@Param('id') id: string) {
    return this.savingsGoalsService.findOne(id);
  }

  @Get(':id/progress')
  @Permissions('CONTRIBUTIONS:READ')
  @ApiOperation({ summary: 'Progression d\'un objectif d\'epargne' })
  getProgress(@Param('id') id: string) {
    return this.savingsGoalsService.getProgress(id);
  }

  @Post(':id/contribute')
  @Permissions('CONTRIBUTIONS:CREATE')
  @ApiOperation({ summary: 'Contribuer a un objectif d\'epargne' })
  contribute(
    @Param('id') id: string,
    @Body() dto: ContributeToGoalDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.savingsGoalsService.contribute(id, dto, userId);
  }

  @Patch(':id/unlock')
  @Permissions('CONTRIBUTIONS:UPDATE')
  @ApiOperation({ summary: 'Debloquer un objectif d\'epargne' })
  unlock(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.savingsGoalsService.unlock(id, userId);
  }
}
