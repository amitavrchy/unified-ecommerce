import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ApiErrorResponseDto } from '../../../common/dto/api-response.dto';
import { MediaUploadService } from '../../../service/cloudinary/media-upload.service';
import { AdminGuard } from '../admin.guard';
import {
  UpdateBusinessLogoDto,
  UpdateBusinessSettingsDto,
  UpdateBusinessSettingsFormDto,
  UpdateLandingHeroDto,
  UploadBusinessLogoFormDto,
  UploadLandingHeroFormDto,
} from './dto/settings.dto';
import { BusinessSettingsResponseDto } from './dto/settings-response.dto';
import { AdminSettingsService } from './settings.service';

const LOGO_FOLDER = 'vacuumCare/logos';
const HERO_FOLDER = 'vacuumCare/hero';

@ApiTags('Admin Settings')
@ApiBearerAuth()
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
export class AdminSettingsController {
  constructor(
    private readonly settings: AdminSettingsService,
    private readonly media: MediaUploadService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the singleton public business settings' })
  @ApiOkResponse({ type: BusinessSettingsResponseDto })
  get() {
    return this.settings.get();
  }

  @Patch()
  @ApiOperation({
    summary: 'Update the singleton public business settings',
    description:
      'Send as multipart form data. Upload a new logo on the logo field, or pass an already-hosted logoUrl.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateBusinessSettingsFormDto })
  @ApiOkResponse({ type: BusinessSettingsResponseDto })
  @UseInterceptors(FileInterceptor('logo'))
  async update(
    @Body() dto: UpdateBusinessSettingsDto,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    if (!logo) return this.settings.update(dto);
    this.media.assertImages([logo]);
    const [logoUrl] = await this.media.uploadUrls([logo], LOGO_FOLDER);
    return this.settings.update({ ...dto, logoUrl });
  }

  @Patch('logo')
  @ApiOperation({ summary: 'Update the public business logo URL' })
  @ApiOkResponse({ type: BusinessSettingsResponseDto })
  updateLogo(@Body() dto: UpdateBusinessLogoDto) {
    return this.settings.update({ logoUrl: dto.logoUrl });
  }

  @Post('logo')
  @ApiOperation({
    summary: 'Upload a business logo image through Cloudinary',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadBusinessLogoFormDto })
  @ApiOkResponse({ type: BusinessSettingsResponseDto })
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(@UploadedFile() logo?: Express.Multer.File) {
    if (!logo) throw new BadRequestException('A logo image is required');
    this.media.assertImages([logo]);
    const [logoUrl] = await this.media.uploadUrls([logo], LOGO_FOLDER);
    return this.settings.update({ logoUrl });
  }

  @Patch('hero')
  @ApiOperation({ summary: 'Update the public landing hero image URL' })
  @ApiOkResponse({ type: BusinessSettingsResponseDto })
  updateHero(@Body() dto: UpdateLandingHeroDto) {
    return this.settings.update({
      landingHeroImageUrl: dto.landingHeroImageUrl,
    });
  }

  @Post('hero')
  @ApiOperation({
    summary: 'Upload a landing hero image through Cloudinary',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadLandingHeroFormDto })
  @ApiOkResponse({ type: BusinessSettingsResponseDto })
  @UseInterceptors(FileInterceptor('hero'))
  async uploadHero(@UploadedFile() hero?: Express.Multer.File) {
    if (!hero) throw new BadRequestException('A hero image is required');
    this.media.assertImages([hero]);
    const [landingHeroImageUrl] = await this.media.uploadUrls(
      [hero],
      HERO_FOLDER,
    );
    return this.settings.update({ landingHeroImageUrl });
  }
}
