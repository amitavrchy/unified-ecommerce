import type { Server } from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../../../generated/prisma/enums';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { CloudinaryService } from '../../service/cloudinary/cloudinary.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import { ChatController } from './chat.controller';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Boots the controller behind the real validation pipe so the multipart path is
 * exercised end to end: form fields arrive as strings and the JSON-encoded
 * attachments list has to survive transformation and whitelisting.
 */
describe('POST /conversations/:id/messages multipart', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Server;
  const tx = {
    chatMessage: { create: jest.fn() },
    conversation: { update: jest.fn() },
    notification: { create: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    conversation: { findUnique: jest.fn() },
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const cloudinary = {
    uploadFile: jest.fn(() =>
      Promise.resolve('https://res.cloudinary.com/demo/inlet.png'),
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinary },
        { provide: NotificationsService, useValue: { notifyUser: jest.fn(), fanOutToActiveAdmins: jest.fn() } },
        MediaUploadService,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = {
            id: 'customer-1',
            email: 'customer@example.com',
            role: UserRole.CUSTOMER,
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      customerId: 'customer-1',
      technicianId: null,
      requestId: 'request-1',
    });
    tx.chatMessage.create.mockResolvedValue({ id: 'message-1' });
    cloudinary.uploadFile.mockResolvedValue(
      'https://res.cloudinary.com/demo/inlet.png',
    );
  });

  it('parses a binary upload and a JSON-encoded attachments field', async () => {
    await request(server())
      .post('/conversations/conversation-1/messages')
      .field('body', 'Here is the inlet.')
      .field(
        'attachments',
        JSON.stringify([{ url: 'https://uploads.example.com/photo.jpg' }]),
      )
      .attach('images', Buffer.from('fake-png'), {
        filename: 'inlet.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(cloudinary.uploadFile).toHaveBeenCalledTimes(1);
    const [args] = tx.chatMessage.create.mock.calls as [
      { data: { body: string; attachments: unknown } },
    ][];
    expect(args[0].data.body).toBe('Here is the inlet.');
    expect(args[0].data.attachments).toEqual([
      { url: 'https://uploads.example.com/photo.jpg' },
      {
        url: 'https://res.cloudinary.com/demo/inlet.png',
        mimeType: 'image/png',
      },
    ]);
  });

  it('rejects a video sent on the images field', async () => {
    await request(server())
      .post('/conversations/conversation-1/messages')
      .field('body', 'Wrong field.')
      .attach('images', Buffer.from('fake-mp4'), {
        filename: 'noise.mp4',
        contentType: 'video/mp4',
      })
      .expect(400);

    expect(cloudinary.uploadFile).not.toHaveBeenCalled();
  });
});
