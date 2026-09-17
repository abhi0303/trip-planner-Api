import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthTokensDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Refresh tokens are opaque random strings stored as SHA-256 hashes, so a
   * database leak cannot be replayed. Rotation happens in `rotate()`.
   */
  async issue(user: Pick<User, 'id' | 'email' | 'username' | 'role'>, context?: { userAgent?: string; ip?: string }): Promise<AuthTokensDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      // jsonwebtoken types expiresIn as a template-literal union; the value is
      // validated by ttlSeconds() and passed through as-is.
      expiresIn: this.config.get<string>('jwt.accessTtl') as unknown as number,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: this.refreshExpiry(),
        userAgent: context?.userAgent?.slice(0, 255),
        ip: context?.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ttlSeconds(this.config.get<string>('jwt.accessTtl') ?? '15m'),
      tokenType: 'Bearer',
    };
  }

  /**
   * Single-use rotation: the presented token is revoked as part of the same
   * transaction that issues its replacement.
   */
  async rotate(refreshToken: string, context?: { userAgent?: string; ip?: string }): Promise<{ tokens: AuthTokensDto; user: User }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    if (stored.user.deletedAt) throw new UnauthorizedException('Account no longer exists');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issue(stored.user, context);
    return { tokens, user: stored.user };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Used on password change — signs every device out. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiry(): Date {
    const ttl = this.ttlSeconds(this.config.get<string>('jwt.refreshTtl') ?? '30d');
    return new Date(Date.now() + ttl * 1000);
  }

  /** Parses `15m` / `30d` / `3600` into seconds. */
  private ttlSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
    if (!match) return 900;
    const value = parseInt(match[1], 10);
    const unit = match[2] ?? 's';
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit] ?? 1);
  }
}
