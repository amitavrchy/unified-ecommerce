import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ReturnStatus } from '../../../../../generated/prisma/enums';
import {
  AdminDateRangeQueryDto,
  AdminPaginationQueryDto,
  AdminSearchQueryDto,
} from '../../common/dto/admin-query.dto';

export class AdminReturnQueryDto extends IntersectionType(
  AdminPaginationQueryDto,
  IntersectionType(AdminSearchQueryDto, AdminDateRangeQueryDto),
) {
  @ApiPropertyOptional({ enum: ReturnStatus, enumName: 'ReturnStatus' })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;
}
