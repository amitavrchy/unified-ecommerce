import { BadRequestException, ConflictException } from '@nestjs/common';
import { MediaKind, UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { CloudinaryService } from '../../service/cloudinary/cloudinary.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeService } from '../payments/stripe.service';
import { QuoteCounterofferService } from './quote-counteroffer.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

function file(
  fieldname: string,
  originalname: string,
  mimetype: string,
): Express.Multer.File {
  return { fieldname, originalname, mimetype } as Express.Multer.File;
}

type CreateArgs = { data: { media?: { create: unknown[] } } };

describe('RequestsController customer submission media', () => {
  const customer: AuthUser = {
    id: 'customer-1',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
  };
  const body = {
    categoryId: 'category-1',
    addressId: 'address-1',
    description: 'Low suction and a rattling sound.',
  };
  const prisma = {
    address: { findFirst: jest.fn() },
    serviceCategory: { findUnique: jest.fn() },
    serviceIssue: { findFirst: jest.fn() },
    serviceRequest: { create: jest.fn(), findUnique: jest.fn() },
    serviceMedia: { create: jest.fn() },
  };
  const notifications = {
    createForUser: jest.fn(),
    fanOutToActiveAdmins: jest.fn(),
    notifyUsers: jest.fn(),
  };
  const cloudinary = { uploadFile: jest.fn() };
  let controller: RequestsController;
  let created: CreateArgs | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    created = undefined;
    prisma.address.findFirst.mockResolvedValue({ id: 'address-1' });
    prisma.serviceCategory.findUnique.mockResolvedValue({ id: 'category-1' });
    prisma.serviceRequest.create.mockImplementation((args: CreateArgs) => {
      created = args;
      return Promise.resolve({
        id: 'request-1',
        requestNumber: 'SR-ABC1234567',
      });
    });
    prisma.serviceRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      requestNumber: 'SR-ABC1234567',
    });
    cloudinary.uploadFile.mockImplementation((upload: Express.Multer.File) =>
      Promise.resolve(`https://res.cloudinary.com/demo/${upload.originalname}`),
    );
    const mediaUploads = new MediaUploadService(
      cloudinary as unknown as CloudinaryService,
    );
    controller = new RequestsController(
      prisma as unknown as PrismaService,
      {} as QuoteCounterofferService,
      notifications as unknown as NotificationsService,
      mediaUploads,
      new RequestsService(
        prisma as unknown as PrismaService,
        notifications as unknown as NotificationsService,
        {} as StripeService,
        mediaUploads,
      ),
    );
  });

  it('uploads images and videos as ISSUE media', async () => {
    await controller.create(customer, body, {
      images: [file('images', 'inlet.png', 'image/png')],
      videos: [file('videos', 'noise.mp4', 'video/mp4')],
    });

    expect(cloudinary.uploadFile).toHaveBeenCalledTimes(2);
    expect(cloudinary.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'inlet.png' }),
      'vacuumCare/service-requests',
    );
    expect(created?.data.media?.create).toEqual([
      {
        url: 'https://res.cloudinary.com/demo/inlet.png',
        mimeType: 'image/png',
        kind: MediaKind.ISSUE,
      },
      {
        url: 'https://res.cloudinary.com/demo/noise.mp4',
        mimeType: 'video/mp4',
        kind: MediaKind.ISSUE,
      },
    ]);
  });

  it('rejects a non-image file sent on the images field before uploading', async () => {
    await expect(
      controller.create(customer, body, {
        images: [file('images', 'manual.pdf', 'application/pdf')],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cloudinary.uploadFile).not.toHaveBeenCalled();
    expect(prisma.serviceRequest.create).not.toHaveBeenCalled();
  });

  it('counts uploads against the attachment cap', async () => {
    await expect(
      controller.create(customer, body, {
        images: Array.from({ length: 11 }, (_, index) =>
          file('images', `photo-${index}.png`, 'image/png'),
        ),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(cloudinary.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads a file posted to the media endpoint', async () => {
    prisma.serviceRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      customerId: customer.id,
      technicianId: null,
      requestNumber: 'SR-ABC1234567',
    });
    prisma.serviceMedia.create.mockResolvedValue({ id: 'media-1' });

    await controller.media(
      customer,
      'request-1',
      { kind: MediaKind.ISSUE },
      file('file', 'inlet.png', 'image/png'),
    );

    expect(cloudinary.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'inlet.png' }),
      'vacuumCare/service-requests',
    );
    expect(prisma.serviceMedia.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        kind: MediaKind.ISSUE,
        url: 'https://res.cloudinary.com/demo/inlet.png',
        mimeType: 'image/png',
      },
    });
  });

  it('rejects a media post that carries neither a file nor a url', async () => {
    prisma.serviceRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      customerId: customer.id,
      technicianId: null,
      requestNumber: 'SR-ABC1234567',
    });

    await expect(
      controller.media(customer, 'request-1', { kind: MediaKind.ISSUE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.serviceMedia.create).not.toHaveBeenCalled();
  });
});
