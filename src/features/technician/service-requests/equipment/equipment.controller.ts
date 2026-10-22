import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
import { EquipmentDto } from '../../../service-requests/dto/service-request.dto';
import { EquipmentResponseDto } from '../../../service-requests/dto/service-request-response.dto';
import { RequestsService } from '../../../service-requests/requests.service';
import { TechnicianGuard } from '../../technician.guard';
import { UpdateEquipmentDto } from './dto/equipment.dto';

@ApiTags('Technician Equipment')
@ApiBearerAuth()
@Controller('technician/service-requests/:id/equipment')
@UseGuards(JwtAuthGuard, TechnicianGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class TechnicianEquipmentController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'List customer equipment and vacuum-port inventory for this job',
    description:
      'Same equipment shape as the admin dashboard: units, additional features, inlets, and media.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: EquipmentResponseDto, isArray: true })
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.listEquipment(user, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create or update technician equipment and inlet-count details',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: EquipmentResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EquipmentDto,
  ) {
    return this.requests.recordEquipment(user, id, dto);
  }

  @Patch(':equipmentId')
  @ApiOperation({
    summary: 'Update a customer equipment record from an assigned job',
    description:
      'Matches the admin equipment fields: unit details, additional features, and floor inlet counts.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiParam({ name: 'equipmentId', description: 'Equipment record ID' })
  @ApiOkResponse({ type: EquipmentResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('equipmentId') equipmentId: string,
    @Body() dto: UpdateEquipmentDto,
  ) {
    return this.requests.updateEquipment(user, id, equipmentId, dto);
  }
}
