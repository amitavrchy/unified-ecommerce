import { ApiProperty } from '@nestjs/swagger';
import { ProductResponseDto } from '../../../catalog/dto/catalog-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export class AdminProductPageDto extends PaginatedResponseDto<ProductResponseDto> {
  @ApiProperty({ type: [ProductResponseDto] })
  declare items: ProductResponseDto[];
}
