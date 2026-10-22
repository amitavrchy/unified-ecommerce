import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';

export class AuthenticatedUserResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0000s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'alex@example.com' })
  email!: string;

  @ApiProperty({
    enum: UserRole,
    enumName: 'UserRole',
    example: UserRole.CUSTOMER,
  })
  role!: UserRole;
}

export class AuthSessionResponseDto {
  @ApiProperty({
    description: 'JWT access token. Send as `Authorization: Bearer <token>`.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature',
  })
  accessToken!: string;

  @ApiProperty({ type: () => AuthenticatedUserResponseDto })
  user!: AuthenticatedUserResponseDto;

  @ApiProperty({
    description:
      'Opaque refresh token — exchange for a new session via POST /auth/refresh.',
    example: '7bc1f1c3b5e44d68a5f4b18a6c2f6b0a...',
  })
  refreshToken!: string;
}

export class AdminCreatedUserResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0000s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'admin@example.com' })
  email!: string;

  @ApiProperty({
    enum: UserRole,
    enumName: 'UserRole',
    example: UserRole.ADMIN,
  })
  role!: UserRole;

  @ApiProperty({ example: 'Jordan' })
  firstName!: string;

  @ApiProperty({ example: 'Lee' })
  lastName!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class SignupResponseDto {
  @ApiProperty({
    description:
      'Always true — every new account must be verified with a 5-digit OTP before login.',
    example: true,
  })
  emailVerificationRequired!: boolean;

  @ApiProperty({
    example: 'A 5-digit verification code has been sent to your email.',
  })
  message!: string;
}

export class VerifyEmailResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    description: 'JWT access token issued after successful email verification.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature',
  })
  accessToken!: string;

  @ApiProperty({ type: () => AuthenticatedUserResponseDto })
  user!: AuthenticatedUserResponseDto;

  @ApiProperty({
    description: 'Opaque refresh token.',
    example: '7bc1f1c3b5e44d68a5f4b18a6c2f6b0a...',
  })
  refreshToken!: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({
    example: 'If that account exists, a reset code has been sent.',
  })
  message!: string;
}

export class ResendVerificationResponseDto {
  @ApiProperty({
    example:
      'If that account exists and still needs verification, a new code has been sent.',
  })
  message!: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
