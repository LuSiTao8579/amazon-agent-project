import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 会话标题可不提供；如果提供，不能为空或全空白。 */
export class CreateChatSessionDto {
  @ApiPropertyOptional({ type: String, maxLength: 200, example: '供应链问题' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/\S/u, { message: '标题不能为空' })
  @MaxLength(200)
  title?: string;
}

/** 只接受文本：不能由客户端提交role或冒充AI回复。保留用户输入中的空格和换行。 */
export class CreateChatMessageDto {
  @ApiProperty({ type: String, maxLength: 8000, example: '你好，请介绍一下你自己。' })
  @IsString()
  @Matches(/\S/u, { message: '消息不能为空' })
  @MaxLength(8000)
  text: string;
}

export class ChatPageDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1, maximum: 1000000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ChatSessionResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId: string;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}

export class ChatMessageResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id: string;
  @ApiProperty({ type: String, format: 'uuid' }) sessionId: string;
  @ApiProperty({ type: String, description: '消息顺序号，字符串避免大整数精度丢失' }) position: string;
  @ApiProperty({ type: String, enum: ['user', 'assistant'] }) role: string;
  @ApiProperty({ type: String, enum: ['text', 'table', 'chart', 'report', 'confirmation'] }) messageType: string;
  @ApiProperty({ type: 'object', additionalProperties: true, example: { text: '你好' } }) content: Record<string, unknown>;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class ChatSessionsPageResponseDto {
  @ApiProperty({ type: [ChatSessionResponseDto] }) items: ChatSessionResponseDto[];
  @ApiProperty({ type: Number }) page: number;
  @ApiProperty({ type: Number }) pageSize: number;
  @ApiProperty({ type: Boolean }) hasMore: boolean;
}

export class ChatMessagesPageResponseDto {
  @ApiProperty({ type: [ChatMessageResponseDto] }) items: ChatMessageResponseDto[];
  @ApiProperty({ type: Number }) page: number;
  @ApiProperty({ type: Number }) pageSize: number;
  @ApiProperty({ type: Boolean }) hasMore: boolean;
}
