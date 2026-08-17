import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatSenderResponseDto {
  @ApiProperty({ example: 'user-id' }) id!: string;
  @ApiProperty({ example: 'Alex' }) firstName!: string;
  @ApiProperty({ example: 'Morgan' }) lastName!: string;
  @ApiPropertyOptional({ nullable: true, format: 'uri' }) avatarUrl!:
    string | null;
}

export class ChatMessageResponseDto {
  @ApiProperty({ example: 'message-id' }) id!: string;
  @ApiProperty({ example: 'conversation-id' }) conversationId!: string;
  @ApiProperty({ example: 'user-id' }) senderId!: string;
  @ApiProperty({ example: 'I will arrive within 20 minutes.' }) body!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  attachments!: object[] | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  readAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: ChatSenderResponseDto }) sender!: ChatSenderResponseDto;
}

export class ConversationResponseDto {
  @ApiProperty({ example: 'conversation-id' }) id!: string;
  @ApiProperty({ example: 'service-request-id' }) requestId!: string;
  @ApiProperty({ example: 'customer-id' }) customerId!: string;
  @ApiPropertyOptional({ nullable: true, example: 'technician-id' })
  technicianId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiPropertyOptional({ type: ChatMessageResponseDto, nullable: true })
  lastMessage!: ChatMessageResponseDto | null;
}
