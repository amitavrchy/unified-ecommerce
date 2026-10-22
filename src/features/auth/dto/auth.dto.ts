import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @ApiProperty({ format: 'email', example: 'alex@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ format: 'password', minLength: 8, example: 'secure-password' })
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Alex' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Morgan' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: '+1 416 555 0100' })
  @IsString()
  phone!: string;

  @ApiProperty({ example: '123 Main Street' })
  @IsString()
  address!: string;

  @ApiPropertyOptional({ example: 'Unit 4B' })
  @IsOptional()
  @IsString()
  apartment?: string;

  @ApiProperty({ example: 'Toronto' })
  @IsString()
  city!: string;

  @ApiProperty({ example: 'ON' })
  @IsString()
  state!: string;

  @ApiProperty({ example: 'M5V 2T6' })
  @IsString()
  zipCode!: string;

  @ApiProperty({
    example: true,
    description: 'Explicit acceptance of the terms displayed by the app.',
  })
  @IsBoolean()
  acceptTerms!: boolean;

  @ApiProperty({
    example: '2026-08-17',
    description: 'Version of the accepted terms.',
  })
  @IsString()
  termsVersion!: string;
}

export class AdminSignupDto {
  @ApiProperty({ format: 'email', example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ format: 'password', minLength: 8, example: 'secure-password' })
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Jordan' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Lee' })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ example: '+1 416 555 0199' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class TechnicianSignupDto extends SignupDto {
  @ApiProperty({ example: 'Greater Toronto Area' })
  @IsString()
  serviceArea!: string;

  @ApiProperty({
    type: [String],
    example: ['Central vacuum repair', 'Installation'],
  })
  @IsArray()
  @IsString({ each: true })
  skills!: string[];

  @ApiPropertyOptional({ example: 'TECH-1001' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'LIC-123456' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({ minimum: 0, example: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional({ example: 'Certified central vacuum technician.' })
  @IsOptional()
  @IsString()
  bio?: string;
}

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'alex@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ format: 'password', example: 'secure-password' })
  @IsString()
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ format: 'email', example: 'alex@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ format: 'email', example: 'alex@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: '5-digit OTP received in the password-reset email.',
    example: '48271',
  })
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/, { message: 'otp must be a 5-digit number' })
  otp!: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    example: 'new-secure-password',
  })
  @MinLength(8)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'Opaque refresh token issued during login or after OTP verification.',
    example: '7bc1f1c3b5e44d68a5f4b18a6c2f6b0a...',
  })
  @IsString()
  refreshToken!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ format: 'email', example: 'alex@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: '5-digit OTP sent to the email address during signup.',
    example: '73920',
  })
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/, { message: 'otp must be a 5-digit number' })
  otp!: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    format: 'email',
    example: 'alex@example.com',
    description: 'Email address that needs a fresh 5-digit verification OTP.',
  })
  @IsEmail()
  email!: string;
}
