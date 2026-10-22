import { ApiProperty } from '@nestjs/swagger';
import { NotificationResponseDto } from '../../../notifications/dto/notification-response.dto';

export class AdminNotificationPageResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];
  @ApiProperty({ example: 84 }) total!: number;
  @ApiProperty({ example: 7 }) unreadCount!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 25 }) pageSize!: number;
}

export class BroadcastNotificationResponseDto {
  @ApiProperty({ example: 124 }) recipients!: number;
}
