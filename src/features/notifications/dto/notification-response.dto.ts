import { ApiProperty } from '@nestjs/swagger';

export class NotificationResponseDto {
  @ApiProperty({ example: 'cm6f4m0xw0010s1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'cm6f4m0xw0000s1a2b3c4d5e6' })
  userId!: string;

  @ApiProperty({ example: 'Technician assigned' })
  title!: string;

  @ApiProperty({
    example: 'A technician has been assigned to your service request.',
  })
  body!: string;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: { serviceRequestId: 'cm6f4m0xw0003s1a2b3c4d5e6' },
  })
  data!: object | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  readAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
