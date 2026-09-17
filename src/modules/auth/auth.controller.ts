import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  ApiEnvelope,
  ApiErrorResponses,
  AuthenticatedUser,
  CurrentUser,
  Public,
} from 'src/common/decorators';
import { MessageDto } from 'src/common/dto/message.dto';
import { UserProfileDto } from 'src/modules/users/dto/user-response.dto';
import { UsersService } from 'src/modules/users/users.service';
import { AuthService, RequestContext } from './auth.service';
import { AuthSessionDto } from './dto/auth-response.dto';
import {
  ChangePasswordDto,
  GoogleLoginDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create an account',
    description: 'Returns the profile plus an access/refresh token pair.',
  })
  @ApiEnvelope(AuthSessionDto, { status: 201, description: 'Account created' })
  @ApiErrorResponses(400, 409, 429)
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, this.ctx(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with email or username' })
  @ApiEnvelope(AuthSessionDto, { description: 'Signed in' })
  @ApiErrorResponses(400, 401, 429)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, this.ctx(req));
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with a Google ID token',
    description:
      'Creates the account on first use. Returns 501 when GOOGLE_CLIENT_ID is not configured.',
  })
  @ApiEnvelope(AuthSessionDto, { description: 'Signed in' })
  @ApiErrorResponses(400, 401, 501)
  google(@Body() dto: GoogleLoginDto, @Req() req: Request) {
    return this.auth.loginWithGoogle(dto, this.ctx(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new pair',
    description: 'Refresh tokens are single-use — the presented token is revoked on success.',
  })
  @ApiEnvelope(AuthSessionDto, { description: 'New token pair issued' })
  @ApiErrorResponses(401)
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, this.ctx(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  @ApiEnvelope(MessageDto)
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every refresh token for the current user' })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(401)
  logoutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.logoutAll(user.id);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user profile' })
  @ApiEnvelope(UserProfileDto)
  @ApiErrorResponses(401)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getProfile(user.id, user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password',
    description: 'Revokes all refresh tokens, so every device must sign in again.',
  })
  @ApiEnvelope(MessageDto)
  @ApiErrorResponses(400, 401)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  private ctx(req: Request): RequestContext {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }
}
