import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from 'src/common/decorators';
import { PrismaService } from 'src/prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') as string,
    });
  }

  /**
   * The token is trusted for identity, but status is re-read so a suspended or
   * deleted account loses access immediately instead of at token expiry.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, username: true, role: true, status: true, deletedAt: true },
    });

    if (!user || user.deletedAt) throw new UnauthorizedException('Account no longer exists');
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This account is suspended');
    }

    return { id: user.id, email: user.email, username: user.username, role: user.role };
  }
}
