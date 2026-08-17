import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TechnicianVerificationStatus } from '../../../../generated/prisma/enums';

export class ProfileDto {
  @ApiPropertyOptional({ example: 'Alex' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Morgan' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '+1 416 555 0100' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    format: 'uri',
    example: 'https://cdn.example.com/avatars/alex.jpg',
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Morgan Home Services' })
  @IsOptional()
  @IsString()
  company?: string;
}

export class AddressDto {
  @ApiProperty({ example: '123 Main Street' })
  @IsString()
  line1!: string;

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

  @ApiPropertyOptional({ example: 'Canada', default: 'Canada' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 43.6426 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -79.3871 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class NotificationPreferencesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class TechnicianProfileDto {
  @ApiPropertyOptional({ example: 'Greater Toronto Area' })
  @IsOptional()
  @IsString()
  serviceArea?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Central vacuum repair', 'Installation'],
  })
  @IsOptional()
  @IsString({ each: true })
  skills?: string[];

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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class TechnicianVerificationDto {
  @ApiProperty({
    enum: TechnicianVerificationStatus,
    enumName: 'TechnicianVerificationStatus',
  })
  @IsEnum(TechnicianVerificationStatus)
  status!: TechnicianVerificationStatus;

  @ApiPropertyOptional({ example: 'Licence document verified.' })
  @IsOptional()
  @IsString()
  verificationNotes?: string;
}
