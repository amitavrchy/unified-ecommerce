import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums';

export class BroadcastNotificationDto {
  @ApiProperty({ example: 'Holiday service hours' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Our office will be closed on Monday.' })
  @IsString()
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    enum: UserRole,
    example: [UserRole.CUSTOMER],
  })
  @IsOptional()
  @IsArray()
  roles?: UserRole[];
}
