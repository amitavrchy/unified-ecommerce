import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
    description:
      'JWT access token. Send it as `Authorization: Bearer <token>`.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature',
  })
  accessToken!: string;

  @ApiProperty({ type: () => AuthenticatedUserResponseDto })
  user!: AuthenticatedUserResponseDto;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({
    example: 'If that account exists, a reset code has been sent.',
  })
  message!: string;

  @ApiPropertyOptional({
    description:
      'Only included outside production to support local development. Never expose this token in production.',
    example: 'cfa3d4b17a0e4f77b9f0d3b321739c22',
  })
  token?: string;
}
