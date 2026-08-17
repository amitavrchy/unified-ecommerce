import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
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
  @ApiProperty({
    description: 'One-time reset token received from the password-reset flow.',
    example: 'cfa3d4b17a0e4f77b9f0d3b321739c22',
  })
  @IsString()
  token!: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    example: 'new-secure-password',
  })
  @MinLength(8)
  password!: string;
}
