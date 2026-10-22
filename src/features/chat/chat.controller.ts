import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Prisma } from '../../../generated/prisma/client';
import { UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import {
  ApiErrorResponseDto,
  SuccessResponseDto,
} from '../../common/dto/api-response.dto';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MediaUploadService } from '../../service/cloudinary/media-upload.service';
import { SendMessageDto, SendMessageFormDto } from './dto/chat.dto';
import {
  ChatMessageResponseDto,
  ConversationResponseDto,
} from './dto/chat-response.dto';

const conversationInclude = {
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
    },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  },
};

const MAX_MESSAGE_ATTACHMENTS = 5;

const CHAT_MEDIA_FOLDER = 'vacuumCare/chat';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUploadService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List service conversations available to the authenticated user',
  })
  @ApiOkResponse({ type: ConversationResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async list(@CurrentUser() user: AuthUser) {
    const conversations = await this.prisma.conversation.findMany({
      where:
        user.role === UserRole.ADMIN
          ? {}
          : { OR: [{ customerId: user.id }, { technicianId: user.id }] },
      include: conversationInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return conversations.map((conversation) =>
      this.conversationResponse(conversation),
    );
  }

  @Post('support')
  @ApiOperation({
    summary: 'Open or retrieve the customer–admin support conversation',
  })
  @ApiCreatedResponse({ type: ConversationResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async openSupport(@CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Only customers can open a support conversation',
      );
    }
    const existing = await this.prisma.conversation.findFirst({
      where: { customerId: user.id, requestId: null },
      include: conversationInclude,
    });
    if (existing) return this.conversationResponse(existing);
    const conversation = await this.prisma.conversation.create({
      data: { customerId: user.id },
      include: conversationInclude,
    });
    return this.conversationResponse(conversation);
  }

  @Post('service-requests/:requestId')
  @ApiOperation({
    summary: 'Open or retrieve the chat for an authorized service request',
  })
  @ApiParam({ name: 'requestId', description: 'Service request ID' })
  @ApiCreatedResponse({ type: ConversationResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async open(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
  ) {
    const request = await this.authorizedRequest(user, requestId);
    const conversation = await this.prisma.conversation.upsert({
      where: { requestId },
      create: {
        requestId,
        customerId: request.customerId,
        technicianId: request.technicianId,
      },
      update: request.technicianId
        ? { technicianId: request.technicianId }
        : {},
      include: conversationInclude,
    });
    return this.conversationResponse(conversation);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'List messages for an authorized conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiOkResponse({ type: ChatMessageResponseDto, isArray: true })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async messages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const conversation = await this.authorizedConversation(user, id);
    return this.prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Send a chat message to the customer or assigned technician',
    description:
      'Send as multipart form data. Upload photos on the images field and clips on the videos field; attachments may also carry already-hosted URLs as a JSON string. At most 5 attachments in total.',
  })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SendMessageFormDto })
  @ApiCreatedResponse({ type: ChatMessageResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: MAX_MESSAGE_ATTACHMENTS },
      { name: 'videos', maxCount: MAX_MESSAGE_ATTACHMENTS },
    ]),
  )
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @UploadedFiles()
    uploads: {
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
    } = {},
  ) {
    const hosted = dto.attachments ?? [];
    const files = [...(uploads.images ?? []), ...(uploads.videos ?? [])];
    if (hosted.length + files.length > MAX_MESSAGE_ATTACHMENTS)
      throw new ForbiddenException(
        `A message can contain at most ${MAX_MESSAGE_ATTACHMENTS} attachments`,
      );
    this.media.assertKind(uploads.images ?? [], 'image');
    this.media.assertKind(uploads.videos ?? [], 'video');
    const conversation = await this.authorizedConversation(user, id);
    // Uploads run after authorization so a rejected message never leaves
    // orphaned files in Cloudinary.
    const uploaded = await this.media.upload(files, CHAT_MEDIA_FOLDER);
    const attachments = [...hosted, ...uploaded];
    const body =
      dto.body?.trim() || (attachments.length ? 'Attachment' : '');
    if (!body) {
      throw new BadRequestException('Message body or an attachment is required');
    }
    const payload = {
      title: 'New message',
      body: body.slice(0, 140),
      data: { conversationId: id, requestId: conversation.requestId },
    };
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId: id,
          senderId: user.id,
          body,
          attachments: attachments.length
            ? (JSON.parse(JSON.stringify(attachments)) as Prisma.InputJsonValue)
            : undefined,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      });
      await tx.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      if (user.id === conversation.customerId) {
        if (conversation.technicianId) {
          await tx.notification.create({
            data: { userId: conversation.technicianId, ...payload },
          });
        } else {
          await this.notifications.fanOutToActiveAdmins(payload, tx);
        }
      } else {
        await tx.notification.create({
          data: { userId: conversation.customerId, ...payload },
        });
      }
      return created;
    });
    if (user.id === conversation.customerId) {
      if (conversation.technicianId) {
        this.notifications.notifyUser(conversation.technicianId);
      }
    } else {
      this.notifications.notifyUser(conversation.customerId);
    }
    return message;
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark received messages in a conversation as read' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.authorizedConversation(user, id);
    await this.prisma.chatMessage.updateMany({
      where: { conversationId: id, senderId: { not: user.id }, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  private async authorizedRequest(user: AuthUser, id: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Service request not found');
    if (
      user.role !== UserRole.ADMIN &&
      request.customerId !== user.id &&
      request.technicianId !== user.id
    ) {
      throw new ForbiddenException(
        'You cannot access this service request conversation',
      );
    }
    return request;
  }

  private async authorizedConversation(user: AuthUser, id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (
      user.role !== UserRole.ADMIN &&
      conversation.customerId !== user.id &&
      conversation.technicianId !== user.id
    ) {
      throw new ForbiddenException('You cannot access this conversation');
    }
    return conversation;
  }

  private conversationResponse(conversation: {
    id: string;
    requestId: string | null;
    customerId: string;
    technicianId: string | null;
    updatedAt: Date;
    messages: unknown[];
    customer?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      avatarUrl: string | null;
    };
  }) {
    return {
      id: conversation.id,
      requestId: conversation.requestId,
      customerId: conversation.customerId,
      technicianId: conversation.technicianId,
      updatedAt: conversation.updatedAt,
      lastMessage: conversation.messages[0] ?? null,
      customer: conversation.customer,
    };
  }
}
