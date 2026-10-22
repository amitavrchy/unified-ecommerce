import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';

type UploadResourceType = 'image' | 'video' | 'raw';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  private get cloudName() {
    return process.env.CLOUDINARY_CLOUD_NAME?.trim();
  }
  private get apiKey() {
    return process.env.CLOUDINARY_API_KEY?.trim();
  }
  private get apiSecret() {
    return process.env.CLOUDINARY_API_SECRET?.trim();
  }
  private get uploadPreset() {
    return process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
  }

  /**
   * Uploads with an API key and secret when both are present, which needs no
   * upload preset. A preset is only required for unsigned uploads, and is still
   * honoured when configured alongside a key so a preset's transformations and
   * restrictions keep applying.
   */
  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const signed = Boolean(this.apiKey && this.apiSecret);
    if (!this.cloudName || (!signed && !this.uploadPreset)) {
      throw new InternalServerErrorException(
        'Cloudinary upload is not configured: set CLOUDINARY_CLOUD_NAME plus either an API key and secret or an unsigned CLOUDINARY_UPLOAD_PRESET',
      );
    }
    const resourceType = this.resourceType(file.mimetype);
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    formData.append('folder', folder);
    if (this.uploadPreset) formData.append('upload_preset', this.uploadPreset);
    if (signed) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      formData.append('timestamp', timestamp);
      formData.append('api_key', this.apiKey!);
      formData.append(
        'signature',
        this.signature({
          folder,
          timestamp,
          ...(this.uploadPreset ? { upload_preset: this.uploadPreset } : {}),
        }),
      );
    }
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
      {
        method: 'POST',
        body: formData,
      },
    );
    if (!response.ok) {
      // Cloudinary explains the refusal in the body ("Upload preset not found",
      // "Invalid Signature", "File size too large"), so losing it leaves the
      // failure undiagnosable from the API response alone.
      const reason = await this.failureReason(response);
      this.logger.error(
        `Cloudinary upload failed for ${file.originalname} (HTTP ${response.status}): ${reason}`,
      );
      throw new InternalServerErrorException(
        `Cloudinary upload failed: ${reason}`,
      );
    }
    const data = (await response.json()) as { secure_url?: string };
    if (!data.secure_url) {
      throw new InternalServerErrorException(
        'Cloudinary did not return a file URL',
      );
    }
    return data.secure_url;
  }

  normalizeUrl(input: string): string {
    const url = this.parseCloudinaryUrl(input);
    if (!url) {
      throw new BadRequestException('A valid Cloudinary URL is required');
    }
    return url.toString();
  }

  private async failureReason(response: Response): Promise<string> {
    const body = await response.text().catch(() => '');
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      // Not JSON, so fall back to whatever text came back.
    }
    return body.slice(0, 200) || response.statusText || 'unknown error';
  }

  private resourceType(mimetype: string): UploadResourceType {
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('image/')) return 'image';
    return 'raw';
  }

  private parseCloudinaryUrl(input: string): URL | null {
    try {
      const url = new URL(input);
      if (!url.hostname.includes('cloudinary.com')) return null;
      return url;
    } catch {
      return null;
    }
  }

  private signature(params: Record<string, string>) {
    const base = Object.entries(params)
      .filter(([, value]) => Boolean(value))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return createHash('sha1').update(`${base}${this.apiSecret}`).digest('hex');
  }
}
