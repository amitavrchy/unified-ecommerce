import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { AdminGuard } from '../admin.guard';
import { AdminReportQueryDto } from './dto/reports.dto';
import { AdminReportOverviewResponseDto } from './dto/reports-response.dto';
import { AdminReportsService } from './reports.service';

@ApiTags('Admin Reports')
@ApiBearerAuth()
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get normalized business and service report data' })
  @ApiOkResponse({ type: AdminReportOverviewResponseDto })
  overview(@Query() query: AdminReportQueryDto) {
    return this.reports.overview(query);
  }

  @Get('export.csv')
  @ApiOperation({ summary: 'Export the normalized report data as CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    schema: { type: 'string', example: '"section","metric","value"' },
  })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(
    @Query() query: AdminReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="admin-report-${query.from}-${query.to}.csv"`,
    );
    return this.reports.csv(query);
  }

  @Get('export.pdf')
  @ApiOperation({ summary: 'Export the normalized report data as PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @Query() query: AdminReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="admin-report-${query.from}-${query.to}.pdf"`,
    );
    return this.reports.pdf(query);
  }
}
