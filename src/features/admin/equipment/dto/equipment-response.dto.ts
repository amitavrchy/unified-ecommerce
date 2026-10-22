import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export class AdminInletResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() floor!: string;
  @ApiProperty() type!: string;
  @ApiProperty() quantity!: number;
}

export class AdminEquipmentMediaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'uri' }) url!: string;
  @ApiPropertyOptional({ nullable: true }) mimeType!: string | null;
  @ApiPropertyOptional({ nullable: true }) caption!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class AdminEquipmentItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional({ nullable: true }) requestId!: string | null;
  @ApiProperty() unitNumber!: string;
  @ApiPropertyOptional({ nullable: true }) manufacturer!: string | null;
  @ApiPropertyOptional({ nullable: true }) model!: string | null;
  @ApiPropertyOptional({ nullable: true }) serialNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) location!: string | null;
  @ApiPropertyOptional({ nullable: true }) condition!: string | null;
  @ApiProperty({ type: [String] }) additionalFeatures!: string[];
  @ApiProperty({ type: [AdminInletResponseDto] })
  inlets!: AdminInletResponseDto[];
  @ApiProperty({ type: [AdminEquipmentMediaResponseDto] })
  media!: AdminEquipmentMediaResponseDto[];
}

export class AdminEquipmentPageDto extends PaginatedResponseDto<AdminEquipmentItemDto> {
  @ApiProperty({ type: [AdminEquipmentItemDto] })
  declare items: AdminEquipmentItemDto[];
}
