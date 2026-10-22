import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BusinessSettingsResponseDto {
  @ApiProperty({ example: 1 }) id!: number;
  @ApiPropertyOptional({ type: String, nullable: true })
  businessName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  officePhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  supportEmail!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  businessAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  serviceArea!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  landingHeroImageUrl!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class PublicSiteSettingsResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  businessName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  officePhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  supportEmail!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  businessAddress!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  serviceArea!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  landingHeroImageUrl!: string | null;
}
