import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from 'src/modules/users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthSessionDto } from './dto/auth-response.dto';
import { ChangePasswordDto, GoogleLoginDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { TokenService } from './token.service';

const BCRYPT_ROUNDS = 12;

export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  private readonly googleClient?: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {
    const clientId = this.config.get<string>('google.clientId');
    if (clientId) this.googleClient = new OAuth2Client(clientId);
  }

  async register(dto: RegisterDto, ctx?: RequestContext): Promise<AuthSessionDto> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
      select: { email: true, username: true },
    });

    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'Email is already registered' : 'Username is already taken',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        provider: AuthProvider.EMAIL,
      },
    });

    return this.session(user, ctx);
  }

  async login(dto: LoginDto, ctx?: RequestContext): Promise<AuthSessionDto> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.identifier }, { username: dto.identifier }] },
    });

    // Same message for unknown account and wrong password: do not leak which
    // emails are registered.
    if (!user?.passwordHash || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This account is suspended');
    }

    return this.session(user, ctx);
  }

  async loginWithGoogle(dto: GoogleLoginDto, ctx?: RequestContext): Promise<AuthSessionDto> {
    if (!this.googleClient) {
      throw new NotImplementedException(
        'Google sign-in is not configured on this environment (GOOGLE_CLIENT_ID is unset)',
      );
    }

    const ticket = await this.googleClient
      .verifyIdToken({
        idToken: dto.idToken,
        audience: this.config.get<string>('google.clientId') as string,
      })
      .catch(() => {
        throw new UnauthorizedException('Google token could not be verified');
      });

    const payload = ticket.getPayload();
    if (!payload?.email) throw new UnauthorizedException('Google account has no email');

    const email = payload.email.toLowerCase();

    // Link by googleId first, then by email so an existing email account can
    // adopt Google sign-in instead of colliding with it.
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: payload.sub }, { email }] },
    });

    if (user) {
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: payload.sub, emailVerified: user.emailVerified || !!payload.email_verified },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          username: await this.users.generateUniqueUsername(dto.username ?? email.split('@')[0]),
          name: payload.name ?? email.split('@')[0],
          profileImage: payload.picture,
          googleId: payload.sub,
          provider: AuthProvider.GOOGLE,
          emailVerified: !!payload.email_verified,
        },
      });
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This account is suspended');
    }

    return this.session(user, ctx);
  }

  async refresh(refreshToken: string, ctx?: RequestContext): Promise<AuthSessionDto> {
    const { tokens, user } = await this.tokens.rotate(refreshToken, ctx);
    return { user: await this.users.getProfile(user.id, user.id), tokens };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.tokens.revoke(refreshToken);
    return { message: 'Signed out' };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.tokens.revokeAllForUser(userId);
    return { message: 'Signed out of all devices' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account signs in with Google. Set a password from account settings first.',
      );
    }
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS) },
    });
    await this.tokens.revokeAllForUser(userId);

    return { message: 'Password updated. Please sign in again.' };
  }

  private async session(user: User, ctx?: RequestContext): Promise<AuthSessionDto> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: await this.users.getProfile(user.id, user.id),
      tokens: await this.tokens.issue(user, ctx),
    };
  }
}
