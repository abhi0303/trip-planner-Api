import { ApiProperty } from '@nestjs/swagger';
import { UserProfileDto } from 'src/modules/users/dto/user-response.dto';

export class AuthTokensDto {
  @ApiProperty({ description: 'Bearer token for the Authorization header' })
  accessToken: string;

  @ApiProperty({ description: 'Used once against /auth/refresh; rotated on every use' })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;
}

export class AuthSessionDto {
  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({ type: AuthTokensDto })
  tokens: AuthTokensDto;
}
