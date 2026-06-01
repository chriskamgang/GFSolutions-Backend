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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('Utilisateurs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Permissions('USERS:CREATE')
  @ApiOperation({ summary: 'Creer un utilisateur' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Permissions('USERS:READ')
  @ApiOperation({ summary: 'Lister les utilisateurs' })
  findAll(@Query('agencyId') agencyId?: string) {
    return this.usersService.findAll(agencyId);
  }

  @Get(':id')
  @Permissions('USERS:READ')
  @ApiOperation({ summary: 'Voir un utilisateur' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Permissions('USERS:UPDATE')
  @ApiOperation({ summary: 'Modifier un utilisateur' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/toggle-active')
  @Permissions('USERS:UPDATE')
  @ApiOperation({ summary: 'Activer/desactiver un utilisateur' })
  toggleActive(@Param('id') id: string) {
    return this.usersService.toggleActive(id);
  }
}
