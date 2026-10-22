import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TechnicianVerificationStatus } from '../../../../../generated/prisma/enums';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AdminPersonSummaryDto } from '../../common/dto/person-summary.dto';

export class AdminTechnicianItemDto extends AdminPersonSummaryDto {
  @ApiProperty() profileId!: string;
  @ApiPropertyOptional({ nullable: true }) employeeId!: string | null;
  @ApiProperty() serviceArea!: string;
  @ApiProperty({ type: [String] }) skills!: string[];
  @ApiProperty() rating!: number;
  @ApiProperty() isAvailable!: boolean;
  @ApiProperty({ enum: TechnicianVerificationStatus })
  verificationStatus!: TechnicianVerificationStatus;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() jobsToday!: number;
  @ApiProperty({
    description: 'Assigned jobs currently IN_PROGRESS for this technician.',
  })
  jobsInProgress!: number;
  @ApiProperty() reportsAwaitingReview!: number;
}

export class AdminTechnicianPageDto extends PaginatedResponseDto<AdminTechnicianItemDto> {
  @ApiProperty({ type: [AdminTechnicianItemDto] })
  declare items: AdminTechnicianItemDto[];
}

export class AdminTechnicianDetailDto extends AdminTechnicianItemDto {
  @ApiPropertyOptional({ nullable: true }) licenseNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) yearsExperience!: number | null;
  @ApiPropertyOptional({ nullable: true }) bio!: string | null;
  @ApiPropertyOptional({ nullable: true }) verificationNotes!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  verifiedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
