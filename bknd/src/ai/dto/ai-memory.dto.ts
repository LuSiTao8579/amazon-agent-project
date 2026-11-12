import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, NotContains } from 'class-validator';
import { AiPaginationDto } from './ai-common.dto.js';

export class CreateAiMemoryDto {
  @ApiProperty({ type: String, maxLength: 10000, example: '偏好中文回复' })
  @IsString({ message: 'content 必须是字符串' })
  @Matches(/\S/u, { message: 'content 不能为空白' })
  @NotContains('\u0000', { message: 'content 不能包含空字符' })
  @MaxLength(10000, { message: 'content 不能超过 10000 个字符' })
  content!: string;
}

/** 记忆只有 content 可编辑；空对象和 null 均不视为有效修改。 */
export class UpdateAiMemoryDto extends CreateAiMemoryDto {}

export class QueryAiMemoryDto extends AiPaginationDto {}
