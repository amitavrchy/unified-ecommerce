import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { SendMessageDto } from './dto/chat.dto';
import {
  ChatMessageResponseDto,
  ConversationResponseDto,
} from './dto/chat-response.dto';

const conversationInclude = {
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  },
} as const;

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly prisma: PrismaService) {}

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
  })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiCreatedResponse({ type: ChatMessageResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    if ((dto.attachments?.length ?? 0) > 5)
      throw new ForbiddenException(
        'A message can contain at most five attachments',
      );
    const conversation = await this.authorizedConversation(user, id);
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId: id,
          senderId: user.id,
          body: dto.body,
          attachments: dto.attachments
            ? (JSON.parse(
                JSON.stringify(dto.attachments),
              ) as Prisma.InputJsonValue)
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
      const recipientId =
        user.id === conversation.customerId
          ? conversation.technicianId
          : conversation.customerId;
      if (recipientId) {
        await tx.notification.create({
          data: {
            userId: recipientId,
            title: 'New message',
            body: dto.body.slice(0, 140),
            data: { conversationId: id, requestId: conversation.requestId },
          },
        });
      }
      return created;
    });
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
    requestId: string;
    customerId: string;
    technicianId: string | null;
    updatedAt: Date;
    messages: unknown[];
  }) {
    return {
      id: conversation.id,
      requestId: conversation.requestId,
      customerId: conversation.customerId,
      technicianId: conversation.technicianId,
      updatedAt: conversation.updatedAt,
      lastMessage: conversation.messages[0] ?? null,
    };
  }
}
