import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallStatus } from '../../../../generated/prisma/enums';

export class AgoraTokenResponseDto {
  @ApiProperty({ example: 'call-id' }) callId!: string;
  @ApiProperty({ example: 'app-id-from-agora-dashboard' }) appId!: string;
  @ApiProperty({ example: '006example-token' }) token!: string;
  @ApiProperty({ example: 'service-request-id-a1b2c3d4' }) channelName!: string;
  @ApiProperty({ example: 'customer-user-id' }) userAccount!: string;
  @ApiProperty({ example: 3600 }) expiresIn!: number;
  @ApiProperty({ example: 1780000000 }) expiresAtUnix!: number;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
}

export class CallSessionResponseDto {
  @ApiProperty({ example: 'call-id' }) id!: string;
  @ApiProperty({ example: 'service-request-id' }) requestId!: string;
  @ApiProperty({ example: 'service-request-id-a1b2c3d4' }) channelName!: string;
  @ApiProperty({ enum: CallStatus, enumName: 'CallStatus' })
  status!: CallStatus;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  endedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
