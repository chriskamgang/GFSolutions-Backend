import { Controller, Post, Body, UseGuards, Patch, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto, ChangePasswordDto, Verify2FADto } from './dto/login.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Connexion utilisateur (supporte 2FA)' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deconnecter (invalider la session)' })
  logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @Post('2fa/setup')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configurer le 2FA (generer QR code)' })
  setup2FA(@CurrentUser('sub') userId: string) {
    return this.authService.setup2FA(userId);
  }

  @Post('2fa/verify')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verifier et activer le 2FA' })
  verify2FA(@CurrentUser('sub') userId: string, @Body() dto: Verify2FADto) {
    return this.authService.verify2FA(userId, dto.totpCode);
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desactiver le 2FA' })
  disable2FA(@CurrentUser('sub') userId: string, @Body() dto: Verify2FADto) {
    return this.authService.disable2FA(userId, dto.totpCode);
  }

  @Patch('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer le mot de passe' })
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto.oldPassword, dto.newPassword);
  }
}
