import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TechnicianVerificationStatus } from '../../../../../generated/prisma/enums';
import {
  AdminPaginationQueryDto,
  AdminSearchQueryDto,
} from '../../common/dto/admin-query.dto';

export class AdminTechnicianQueryDto extends IntersectionType(
  AdminPaginationQueryDto,
  AdminSearchQueryDto,
) {
  @ApiPropertyOptional({ enum: TechnicianVerificationStatus })
  @IsOptional()
  @IsEnum(TechnicianVerificationStatus)
  verificationStatus?: TechnicianVerificationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    example: 'America/Toronto',
    default: 'UTC',
    description: 'IANA timezone used for jobsToday.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}

export class AdminUpdateTechnicianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceArea?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseNumber?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class AdminVerifyTechnicianDto {
  @ApiProperty({
    enum: TechnicianVerificationStatus,
    enumName: 'TechnicianVerificationStatus',
    example: TechnicianVerificationStatus.VERIFIED,
  })
  @IsEnum(TechnicianVerificationStatus)
  status!: TechnicianVerificationStatus;

  @ApiPropertyOptional({ example: 'Licence document verified.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  verificationNotes?: string;
}
