import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/api-response.dto';
import { SubmitContactDto } from './dto/contact.dto';
import { ContactService } from './contact.service';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a public contact-form message through Brevo',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiCreatedResponse({ type: SuccessResponseDto })
  submit(@Body() dto: SubmitContactDto) {
    return this.contact.submit(dto);
  }
}
