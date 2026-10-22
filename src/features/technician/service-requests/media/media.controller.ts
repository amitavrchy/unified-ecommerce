import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
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
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../../common/auth/auth.types';
import { CurrentUser } from '../../../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../../common/dto/api-response.dto';
import { ServiceMediaResponseDto } from '../../../service-requests/dto/service-request-response.dto';
import { RequestsService } from '../../../service-requests/requests.service';
import { TechnicianGuard } from '../../technician.guard';
import { TechnicianMediaDto, TechnicianMediaFormDto } from './dto/media.dto';

@ApiTags('Technician Media')
@ApiBearerAuth()
@Controller('technician/service-requests/:id/media')
@UseGuards(JwtAuthGuard, TechnicianGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class TechnicianMediaController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  @ApiOperation({
    summary: 'Upload before, after, equipment, or inlet media for an assigned job',
    description:
      'Send multipart form data with kind plus a raw file. The file is uploaded to Cloudinary. Text URLs are not accepted.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: TechnicianMediaFormDto })
  @ApiCreatedResponse({ type: ServiceMediaResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(FileInterceptor('file'))
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TechnicianMediaDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'A file upload is required. Hosted URLs are not accepted.',
      );
    }
    return this.requests.addMedia(user, id, { kind: dto.kind }, file);
  }
}
