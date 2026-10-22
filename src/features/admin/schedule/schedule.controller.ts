import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { AdminGuard } from '../admin.guard';
import { AdminScheduleQueryDto } from './dto/schedule.dto';
import { AdminScheduleItemDto } from './dto/schedule-response.dto';
import { AdminScheduleService } from './schedule.service';

@ApiTags('Admin Schedule')
@ApiBearerAuth()
@Controller('admin/schedule')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminScheduleController {
  constructor(private readonly schedule: AdminScheduleService) {}

  @Get()
  @ApiOperation({
    summary: 'Get a date-range schedule for day, week, or month views',
  })
  @ApiOkResponse({ type: AdminScheduleItemDto, isArray: true })
  list(@Query() query: AdminScheduleQueryDto) {
    return this.schedule.list(query);
  }
}
