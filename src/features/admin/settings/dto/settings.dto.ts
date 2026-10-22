import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ApiBinaryFile,
  ApiRequiredBinaryFile,
} from '../../../../common/dto/api-file.decorator';

export class BusinessSettingsDto {
  @ApiPropertyOptional({ example: 'Vacuum Care' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({ example: '+1 416 555 0100' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  officePhone?: string;

  @ApiPropertyOptional({ example: 'support@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  supportEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceArea?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  logoUrl?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  landingHeroImageUrl?: string;
}

export class UpdateBusinessSettingsDto extends PartialType(
  BusinessSettingsDto,
) {}

/** Documents the multipart variant of the settings payload for Swagger. */
export class UpdateBusinessSettingsFormDto extends UpdateBusinessSettingsDto {
  @ApiBinaryFile('Logo image uploaded to Cloudinary in place of logoUrl.')
  logo?: unknown;
}

/** Documents the logo-only upload body for Swagger. */
export class UploadBusinessLogoFormDto {
  @ApiRequiredBinaryFile('Logo image uploaded to Cloudinary.')
  logo!: unknown;
}

export class UpdateBusinessLogoDto {
  @ApiProperty({ example: 'https://cdn.example.com/logo.png' })
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  logoUrl!: string;
}

/** Documents the landing-hero-only upload body for Swagger. */
export class UploadLandingHeroFormDto {
  @ApiRequiredBinaryFile('Landing hero image uploaded to Cloudinary.')
  hero!: unknown;
}

export class UpdateLandingHeroDto {
  @ApiProperty({ example: 'https://cdn.example.com/hero.jpg' })
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  landingHeroImageUrl!: string;
}
