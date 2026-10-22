import { ApiProperty } from '@nestjs/swagger';

export class TechnicianHomeStatsResponseDto {
  @ApiProperty({ example: 'Marc' })
  firstName!: string;

  @ApiProperty({ example: 3, description: 'Assigned jobs scheduled for today.' })
  jobsToday!: number;

  @ApiProperty({ example: 1 })
  inProgress!: number;

  @ApiProperty({
    example: 12,
    description: 'Assigned jobs completed in the current local month.',
  })
  completedThisMonth!: number;

  @ApiProperty({
    example: 8,
    description:
      'Assigned jobs whose scheduled start falls in the current local week (Monday–Sunday), excluding cancelled.',
  })
  weeklyTasks!: number;

  @ApiProperty({
    example: 5,
    description: 'Assigned jobs completed in the current local week.',
  })
  completedThisWeek!: number;

  @ApiProperty({
    example: 84,
    description: 'All-time assigned jobs in COMPLETED status.',
  })
  totalCompleted!: number;

  @ApiProperty({
    example: 4,
    description: 'Assigned jobs still in SCHEDULED status.',
  })
  upcoming!: number;

  @ApiProperty({ example: 4.8 })
  averageRating!: number;

  @ApiProperty({ example: '2026-08-27' })
  date!: string;

  @ApiProperty({ example: 'America/Toronto' })
  timezone!: string;
}
