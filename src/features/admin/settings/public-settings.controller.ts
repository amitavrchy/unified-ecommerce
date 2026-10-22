import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicSiteSettingsResponseDto } from './dto/settings-response.dto';
import { AdminSettingsService } from './settings.service';

@ApiTags('Public Settings')
@Controller('public/settings')
export class PublicSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Public site settings used by the storefront',
    description:
      'Unauthenticated. Returns business identity fields and the landing hero image URL.',
  })
  @ApiOkResponse({ type: PublicSiteSettingsResponseDto })
  getPublic() {
    return this.settings.getPublic();
  }
}
