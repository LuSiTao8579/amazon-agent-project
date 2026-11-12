import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ChatMessageResponseDto } from './ai-agent.dto.js';

export class CreateChatTurnDto {
  @ApiProperty({ type: String, format: 'uuid', description: '客户端为本次发送生成的唯一UUID；网络重试使用同一编号' })
  @IsUUID()
  requestId: string;

  @ApiProperty({ type: String, maxLength: 8000, example: '你好，请用一句话介绍你自己。' })
  @IsString()
  @Matches(/\S/u, { message: '消息不能为空' })
  @MaxLength(8000)
  text: string;
}

export class ChatTurnResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) turnId: string;
  @ApiProperty({ type: String, enum: ['completed'] }) status: string;
  @ApiProperty({ type: ChatMessageResponseDto }) userMessage: ChatMessageResponseDto;
  @ApiProperty({ type: ChatMessageResponseDto }) assistantMessage: ChatMessageResponseDto;
}
