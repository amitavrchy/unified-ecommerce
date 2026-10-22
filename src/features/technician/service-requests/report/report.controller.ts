import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../../common/auth/auth.types';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../../common/dto/api-response.dto';
import { ReportDto } from '../../../service-requests/dto/service-request.dto';
import { ServiceReportResponseDto } from '../../../service-requests/dto/service-request-response.dto';
import { RequestsService } from '../../../service-requests/requests.service';
import { TechnicianGuard } from '../../technician.guard';
import { TechnicianUpdateReportDto } from './dto/report.dto';

@ApiTags('Technician Reports')
@ApiBearerAuth()
@Controller('technician/service-requests/:id/report')
@UseGuards(JwtAuthGuard, TechnicianGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class TechnicianReportController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the service report for an assigned job',
    description:
      'Returns work performed, parts used, visit times, and technician notes.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceReportResponseDto })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.getReport(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Submit or create a technician service report' })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: ServiceReportResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReportDto,
  ) {
    return this.requests.submitReport(user, id, dto);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update an existing technician service report',
    description:
      'Allowed while the job is IN_PROGRESS or REPORT_SUBMITTED. Use POST to create the first report.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: ServiceReportResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TechnicianUpdateReportDto,
  ) {
    return this.requests.updateReport(user, id, dto);
  }
}
