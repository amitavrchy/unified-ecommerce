import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminServiceRequestItemDto } from '../../service-requests/dto/service-requests-response.dto';

export class AdminScheduleAddressDto {
  @ApiProperty() line1!: string;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty() zipCode!: string;
}

export class AdminScheduleItemDto extends AdminServiceRequestItemDto {
  @ApiProperty({ type: String, format: 'date-time' })
  declare scheduledStart: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  scheduledEnd!: Date | null;
  @ApiProperty({ type: AdminScheduleAddressDto })
  address!: AdminScheduleAddressDto;
}
