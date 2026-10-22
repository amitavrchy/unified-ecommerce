import { ApiProperty } from '@nestjs/swagger';
import { RequestStatus } from '../../../../../generated/prisma/enums';
import {
  QuoteCounterofferResponseDto,
  QuoteResponseDto,
} from '../../../service-requests/dto/service-request-response.dto';

export class AdminCounterofferCustomerResponseDto {
  @ApiProperty({ example: 'customer-id' }) id!: string;
  @ApiProperty({ example: 'Sarah' }) firstName!: string;
  @ApiProperty({ example: 'Johnson' }) lastName!: string;
  @ApiProperty({ example: 'sarah@example.com' }) email!: string;
}

export class AdminCounterofferRequestContextResponseDto {
  @ApiProperty({ example: 'request-id' }) id!: string;
  @ApiProperty({ example: 'SR-1048' }) requestNumber!: string;
  @ApiProperty({ example: 'customer-id' }) customerId!: string;
  @ApiProperty({ enum: RequestStatus, enumName: 'RequestStatus' })
  status!: RequestStatus;
}

export class AdminCounterofferQuotationResponseDto extends QuoteResponseDto {
  @ApiProperty({ type: AdminCounterofferRequestContextResponseDto })
  request!: AdminCounterofferRequestContextResponseDto;
}

export class AdminPendingCounterofferResponseDto extends QuoteCounterofferResponseDto {
  @ApiProperty({ type: AdminCounterofferCustomerResponseDto })
  customer!: AdminCounterofferCustomerResponseDto;

  @ApiProperty({ type: AdminCounterofferQuotationResponseDto })
  quotation!: AdminCounterofferQuotationResponseDto;
}

export class AdminPendingCounterofferQueueResponseDto {
  @ApiProperty({ type: [AdminPendingCounterofferResponseDto] })
  items!: AdminPendingCounterofferResponseDto[];
  @ApiProperty({ minimum: 0, example: 12 }) total!: number;
  @ApiProperty({ minimum: 1, example: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 100, example: 25 })
  pageSize!: number;
}
