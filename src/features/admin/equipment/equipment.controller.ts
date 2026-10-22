import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { AdminEquipmentService } from './equipment.service';
import { AdminGuard } from '../admin.guard';
import {
  AdminCreateEquipmentDto,
  AdminEquipmentMediaDto,
  AdminEquipmentMediaFormDto,
  AdminEquipmentQueryDto,
  AdminSetInletQuantityDto,
  AdminUpdateEquipmentDto,
} from './dto/equipment.dto';
import {
  AdminEquipmentItemDto,
  AdminEquipmentMediaResponseDto,
  AdminEquipmentPageDto,
  AdminInletResponseDto,
} from './dto/equipment-response.dto';

@ApiTags('Admin Equipment')
@ApiBearerAuth()
@Controller('admin/customers/:customerId/equipment')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminEquipmentController {
  constructor(private readonly equipment: AdminEquipmentService) {}

  @Get()
  @ApiOperation({ summary: 'List customer equipment and inlet inventory' })
  @ApiOkResponse({ type: AdminEquipmentPageDto })
  list(
    @Param('customerId') customerId: string,
    @Query() query: AdminEquipmentQueryDto,
  ) {
    return this.equipment.list(customerId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer equipment inventory detail' })
  @ApiParam({ name: 'id', description: 'Equipment ID' })
  @ApiOkResponse({ type: AdminEquipmentItemDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  detail(@Param('customerId') customerId: string, @Param('id') id: string) {
    return this.equipment.detail(customerId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a missing customer equipment record' })
  @ApiCreatedResponse({ type: AdminEquipmentItemDto })
  create(
    @Param('customerId') customerId: string,
    @Body() dto: AdminCreateEquipmentDto,
  ) {
    return this.equipment.create(customerId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer equipment record' })
  @ApiOkResponse({ type: AdminEquipmentItemDto })
  update(
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() dto: AdminUpdateEquipmentDto,
  ) {
    return this.equipment.update(customerId, id, dto);
  }

  @Patch(':id/inlets/:floor/:type')
  @ApiOperation({ summary: 'Set one equipment inlet quantity' })
  @ApiOkResponse({ type: AdminInletResponseDto })
  setInlet(
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Param('floor') floor: string,
    @Param('type') type: string,
    @Body() dto: AdminSetInletQuantityDto,
  ) {
    return this.equipment.setInlet(customerId, id, floor, type, dto);
  }

  @Post(':id/media')
  @ApiOperation({
    summary: 'Attach an image or video to equipment',
    description:
      'Send as multipart form data. Upload a file on the file field, or pass an already-hosted url.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AdminEquipmentMediaFormDto })
  @ApiCreatedResponse({ type: AdminEquipmentMediaResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FileInterceptor('file'))
  addMedia(
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() dto: AdminEquipmentMediaDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.equipment.addMedia(customerId, id, dto, file);
  }
}
