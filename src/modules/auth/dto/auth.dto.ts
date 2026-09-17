import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'sreyanse@example.com' })
  @IsEmail({}, { message: 'A valid email is required' })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email: string;

  @ApiProperty({
    example: 'sreyanse',
    description: '3-30 chars, lowercase letters, numbers, underscore and dot only',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9._]+$/, {
    message: 'username may only contain lowercase letters, numbers, dot and underscore',
  })
  @Transform(({ value }) => String(value).trim().toLowerCase())
  username: string;

  @ApiProperty({ example: 'Sreyanse Pradhan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({
    example: 'Str0ng!Passphrase',
    description: 'Minimum 8 characters, with at least one letter and one number',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  password: string;
}

export class LoginDto {
  @ApiProperty({
    example: 'sreyanse@example.com',
    description: 'Email address or username',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => String(value).trim().toLowerCase())
  identifier: string;

  @ApiProperty({ example: 'Str0ng!Passphrase' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token obtained on the client' })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({
    description: 'Preferred username for first-time sign-up; auto-generated when omitted',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9._]+$/)
  @MinLength(3)
  @MaxLength(30)
  username?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token issued by /auth/login or /auth/refresh' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  newPassword: string;
}
