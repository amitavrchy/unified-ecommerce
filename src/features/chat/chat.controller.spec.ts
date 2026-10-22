import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { CloudinaryService } from '../../service/cloudinary/cloudinary.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import { ChatController } from './chat.controller';

function file(originalname: string, mimetype: string): Express.Multer.File {
  return { originalname, mimetype } as Express.Multer.File;
}

type CreateArgs = { data: { attachments?: { url: string }[] } };

describe('ChatController message attachments', () => {
  const sender: AuthUser = {
    id: 'customer-1',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
  };
  const tx = {
    chatMessage: { create: jest.fn() },
    conversation: { update: jest.fn() },
    notification: { create: jest.fn() },
  };
  const prisma = {
    conversation: { findUnique: jest.fn() },
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const cloudinary = { uploadFile: jest.fn() };
  let controller: ChatController;
  let created: CreateArgs | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    created = undefined;
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      customerId: sender.id,
      technicianId: 'technician-1',
      requestId: 'request-1',
    });
    tx.chatMessage.create.mockImplementation((args: CreateArgs) => {
      created = args;
      return Promise.resolve({ id: 'message-1' });
    });
    cloudinary.uploadFile.mockImplementation((upload: Express.Multer.File) =>
      Promise.resolve(`https://res.cloudinary.com/demo/${upload.originalname}`),
    );
    controller = new ChatController(
      prisma as unknown as PrismaService,
      new MediaUploadService(cloudinary as unknown as CloudinaryService),
      { notifyUser: jest.fn(), fanOutToActiveAdmins: jest.fn() } as never,
    );
  });

  it('stores uploaded images and videos alongside hosted attachment URLs', async () => {
    await controller.send(
      sender,
      'conversation-1',
      {
        body: 'Here is the inlet.',
        attachments: [{ url: 'https://uploads.example.com/photo.jpg' }],
      },
      {
        images: [file('inlet.png', 'image/png')],
        videos: [file('noise.mp4', 'video/mp4')],
      },
    );

    expect(cloudinary.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'inlet.png' }),
      'vacuumCare/chat',
    );
    expect(created?.data.attachments).toEqual([
      { url: 'https://uploads.example.com/photo.jpg' },
      {
        url: 'https://res.cloudinary.com/demo/inlet.png',
        mimeType: 'image/png',
      },
      {
        url: 'https://res.cloudinary.com/demo/noise.mp4',
        mimeType: 'video/mp4',
      },
    ]);
  });

  it('counts uploads against the five attachment cap', async () => {
    await expect(
      controller.send(
        sender,
        'conversation-1',
        {
          body: 'Too many.',
          attachments: Array.from({ length: 4 }, (_, index) => ({
            url: `https://uploads.example.com/photo-${index}.jpg`,
          })),
        },
        { images: [file('a.png', 'image/png'), file('b.png', 'image/png')] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(cloudinary.uploadFile).not.toHaveBeenCalled();
  });
});
