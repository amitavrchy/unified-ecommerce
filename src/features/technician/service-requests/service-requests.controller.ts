import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequestStatus } from '../../../../generated/prisma/enums';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { ServiceRequestResponseDto } from '../../service-requests/dto/service-request-response.dto';
import { RequestsService } from '../../service-requests/requests.service';
import { TechnicianGuard } from '../technician.guard';
import { TechnicianUpdateStatusDto } from './dto/service-requests.dto';

@ApiTags('Technician Service Requests')
@ApiBearerAuth()
@Controller('technician/service-requests')
@UseGuards(JwtAuthGuard, TechnicianGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class TechnicianServiceRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'List jobs assigned to the authenticated technician',
    description:
      'Admin assigns the technician and sends the schedule. This list only includes those assigned jobs. Each item includes customer contact and the job address.',
  })
  @ApiQuery({ name: 'status', required: false, enum: RequestStatus })
  @ApiOkResponse({ type: ServiceRequestResponseDto, isArray: true })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: RequestStatus) {
    return this.requests.listAssigned(user, status);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one assigned service request',
    description:
      'Includes the job customer contact (name, email, phone) and service address. Use customer.phone for a native call, and address for navigation.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.viewAsTechnician(user, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update job status as the assigned technician',
    description:
      'The only technician status action is starting a SCHEDULED visit (IN_PROGRESS). Completing the visit is done by submitting the service report.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TechnicianUpdateStatusDto,
  ) {
    return this.requests.start(user, id, {
      status: dto.status as unknown as RequestStatus,
      note: dto.note,
    });
  }
}
