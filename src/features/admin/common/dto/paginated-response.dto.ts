import { ApiProperty } from '@nestjs/swagger';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export abstract class PaginatedResponseDto<T> implements PaginatedResult<T> {
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description:
      'Resource items. Concrete response DTOs should override this Swagger item type.',
  })
  items!: T[];

  @ApiProperty({ minimum: 0, example: 124 })
  total!: number;

  @ApiProperty({ minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 25 })
  pageSize!: number;
}
