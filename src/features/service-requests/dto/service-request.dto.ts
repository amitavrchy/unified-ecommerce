import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaKind, RequestStatus } from '../../../../generated/prisma/enums';

export class AttachmentDto {
  @ApiProperty({
    format: 'uri',
    example: 'https://uploads.example.com/issues/photo-1.jpg',
  })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class CreateRequestDto {
  @ApiProperty({ example: 'service-category-id' })
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional({
    example: 'service-issue-id',
    description: 'Must belong to categoryId.',
  })
  @IsOptional()
  @IsString()
  issueId?: string;

  @ApiProperty({ example: 'saved-address-id' })
  @IsString()
  addressId!: string;

  @ApiProperty({
    example: 'The central vacuum has low suction and makes a rattling sound.',
    maxLength: 4000,
  })
  @IsString()
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2026-09-02T09:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @ApiPropertyOptional({ example: '09:00-12:00' })
  @IsOptional()
  @IsString()
  preferredTime?: string;

  @ApiPropertyOptional({ type: [AttachmentDto], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class UpdateRequestStatusDto {
  @ApiProperty({
    enum: RequestStatus,
    enumName: 'RequestStatus',
    example: RequestStatus.UNDER_REVIEW,
  })
  @IsEnum(RequestStatus)
  status!: RequestStatus;

  @ApiPropertyOptional({ example: 'Reviewed with customer by phone.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CancelRequestDto {
  @ApiProperty({ example: 'The issue has been resolved.' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class AssignTechnicianDto {
  @ApiProperty({ example: 'technician-user-id' })
  @IsString()
  technicianId!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-02T13:00:00.000Z',
  })
  @IsDateString()
  scheduledStart!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-02T15:00:00.000Z',
  })
  @IsDateString()
  scheduledEnd!: string;
}

export class CreateQuoteDto {
  @ApiProperty({ minimum: 0, example: 125 })
  @IsNumber()
  @Min(0)
  laborAmount!: number;

  @ApiProperty({ minimum: 0, example: 45 })
  @IsNumber()
  @Min(0)
  partsAmount!: number;

  @ApiProperty({ minimum: 0, example: 22.1 })
  @IsNumber()
  @Min(0)
  taxAmount!: number;

  @ApiPropertyOptional({ minimum: 0, example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({
    example: 'Includes replacement filter and installation.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-09-09T23:59:59.000Z',
  })
  @IsDateString()
  validUntil!: string;
}

export class AcceptQuoteDto {
  @ApiProperty({
    example: true,
    description: 'Customer must explicitly accept the displayed service terms.',
  })
  @IsBoolean()
  acceptTerms!: boolean;

  @ApiProperty({ example: '2026-08-17' })
  @IsString()
  @MaxLength(100)
  termsVersion!: string;
}

export class RejectQuoteDto {
  @ApiPropertyOptional({ example: 'Please revise the parts allowance.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class MediaDto extends AttachmentDto {
  @ApiProperty({
    enum: MediaKind,
    enumName: 'MediaKind',
    example: MediaKind.BEFORE,
  })
  @IsEnum(MediaKind)
  kind!: MediaKind;
}

export class PartUsedDto {
  @ApiProperty({ example: 'Filter cartridge' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class ReportDto {
  @ApiProperty({ example: 'Repaired' })
  @IsString()
  @MaxLength(500)
  repairStatus!: string;

  @ApiProperty({
    example: 'Cleaned the unit, replaced the filter, and tested suction.',
    maxLength: 5000,
  })
  @IsString()
  @MaxLength(5000)
  workPerformed!: string;

  @ApiPropertyOptional({ example: 'Recommend annual maintenance.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  technicianNotes?: string;

  @ApiPropertyOptional({ type: [PartUsedDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartUsedDto)
  partsUsed?: PartUsedDto[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  followUpRequired?: boolean;

  @ApiPropertyOptional({ example: 'Call customer after one week.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpNotes?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  arrivalTime?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  departureTime?: string;
}

export class InletCountDto {
  @ApiProperty({ example: 'Basement' })
  @IsString()
  @MaxLength(100)
  floor!: string;

  @ApiProperty({ example: 'Standard inlet' })
  @IsString()
  @MaxLength(100)
  type!: string;

  @ApiProperty({ example: 3, minimum: 0 })
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class EquipmentDto {
  @ApiProperty({ example: 'Unit 24' })
  @IsString()
  @MaxLength(200)
  unitNumber!: string;

  @ApiPropertyOptional({ example: 'Cyclo Vac' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ example: 'H725' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'SN-123456' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({ example: 'Utility room' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Good' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ type: [InletCountDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InletCountDto)
  inlets?: InletCountDto[];
}
