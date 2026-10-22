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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import { RequestsService } from '../../../service-requests/requests.service';
import { TechnicianGuard } from '../../technician.guard';
import { TechnicianNoteDto } from './dto/note.dto';
import { TechnicianNoteResponseDto } from './dto/note-response.dto';

@ApiTags('Technician Notes')
@ApiBearerAuth()
@Controller('technician/service-requests/:id/note')
@UseGuards(JwtAuthGuard, TechnicianGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class TechnicianNoteController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the technician note on an assigned job',
    description:
      'One free-text note per service request. Separate from the service report.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: TechnicianNoteResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.getNote(user, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a technician note on an assigned job',
    description:
      'Body is `{ "text": "..." }` only. Fails with 409 if a note already exists — use PATCH to change it.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiCreatedResponse({ type: TechnicianNoteResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  add(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TechnicianNoteDto,
  ) {
    return this.requests.addNote(user, id, dto.text);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update the technician note on an assigned job',
    description:
      'Body is `{ "text": "..." }` only. Fails with 404 if no note has been added yet.',
  })
  @ApiParam({ name: 'id', description: 'Service request ID' })
  @ApiOkResponse({ type: TechnicianNoteResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TechnicianNoteDto,
  ) {
    return this.requests.updateNote(user, id, dto.text);
  }
}
