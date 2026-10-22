import { PartialType } from '@nestjs/swagger';
import { ReportDto } from '../../../../service-requests/dto/service-request.dto';

export class TechnicianUpdateReportDto extends PartialType(ReportDto) {}
