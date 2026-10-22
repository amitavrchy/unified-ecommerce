import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { TechnicianHomeStatsResponseDto } from './dto/home-response.dto';
import { TechnicianHomeStatsQueryDto } from './dto/home.dto';
import { TechnicianGuard } from '../technician.guard';
import { TechnicianHomeService } from './home.service';

@ApiTags('Technician Home')
@ApiBearerAuth()
@Controller('technician/home-stats')
@UseGuards(JwtAuthGuard, TechnicianGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class TechnicianHomeController {
  constructor(private readonly home: TechnicianHomeService) {}

  @Get()
  @ApiOperation({
    summary: 'Get technician home KPI cards',
    description:
      'Jobs today, in progress, this week, completed this month/week, all-time completed, upcoming scheduled, and average rating.',
  })
  @ApiOkResponse({ type: TechnicianHomeStatsResponseDto })
  stats(
    @CurrentUser() user: AuthUser,
    @Query() query: TechnicianHomeStatsQueryDto,
  ) {
    return this.home.stats(user, query);
  }
}
