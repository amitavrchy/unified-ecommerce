import { BadRequestException, Injectable } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

export type UploadedMedia = { url: string; mimeType: string };

export type MediaKindName = 'image' | 'video';

/**
 * Shared Cloudinary upload rules for every multipart endpoint: content types
 * are checked before anything is sent upstream so a rejected request never
 * leaves orphaned remote files.
 */
@Injectable()
export class MediaUploadService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  /** Rejects a file whose content type is neither an image nor a video. */
  assertMedia(files: Express.Multer.File[]): void {
    for (const file of files) {
      if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(file.mimetype ?? '')) {
        throw new BadRequestException(
          `${file.originalname} must be an image or video file`,
        );
      }
    }
  }

  /** Rejects a file that was sent on a field reserved for another kind. */
  assertKind(files: Express.Multer.File[], kind: MediaKindName): void {
    for (const file of files) {
      if (!file.mimetype?.startsWith(`${kind}/`)) {
        throw new BadRequestException(
          `${file.originalname} is not a ${kind} file; send it on the ${
            kind === 'image' ? 'videos' : 'images'
          } field instead`,
        );
      }
    }
  }

  /** Rejects any file that is not an image. */
  assertImages(files: Express.Multer.File[]): void {
    for (const file of files) {
      if (!file.mimetype?.startsWith('image/')) {
        throw new BadRequestException(
          `${file.originalname} must be an image file`,
        );
      }
    }
  }

  /** Rejects any file that is neither a PDF nor an image. */
  assertDocuments(files: Express.Multer.File[]): void {
    for (const file of files) {
      if (
        !/^(image\/[a-z0-9.+-]+|application\/pdf)$/i.test(file.mimetype ?? '')
      ) {
        throw new BadRequestException(
          `${file.originalname} must be a PDF or image file`,
        );
      }
    }
  }

  /** Uploads files and returns the stored URL together with its content type. */
  async upload(
    files: Express.Multer.File[],
    folder: string,
  ): Promise<UploadedMedia[]> {
    return Promise.all(
      files.map(async (file) => ({
        url: await this.cloudinary.uploadFile(file, folder),
        mimeType: file.mimetype,
      })),
    );
  }

  /** Uploads files and returns only their URLs. */
  async uploadUrls(
    files: Express.Multer.File[],
    folder: string,
  ): Promise<string[]> {
    if (!files.length) return [];
    return Promise.all(
      files.map((file) => this.cloudinary.uploadFile(file, folder)),
    );
  }
}
