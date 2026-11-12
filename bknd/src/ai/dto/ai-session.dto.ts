import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, NotContains, ValidateIf } from 'class-validator';
import { AI_SESSION_STATUSES, type AiSessionStatus } from '../ai.constants.js';
import { AiPaginationDto } from './ai-common.dto.js';

/** title 属于已有会话；扩展记录的 ID 和用户由服务端确定。 */
export class CreateAiSessionDto {
  @ApiPropertyOptional({ type: String, maxLength: 200, example: '供应链问题' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'title 必须是字符串' })
  @Matches(/\S/u, { message: 'title 不能为空白' })
  @NotContains('\u0000', { message: 'title 不能包含空字符' })
  @MaxLength(200, { message: 'title 不能超过 200 个字符' })
  title?: string;
}

/** 这里只更新 AI 扩展状态；标题属于已有聊天会话，本 DTO 不修改标题。 */
export class UpdateAiSessionDto {
  @ApiProperty({ enum: AI_SESSION_STATUSES })
  @IsIn(AI_SESSION_STATUSES, { message: 'status 必须是 active 或 closed' })
  status!: AiSessionStatus;
}

export class QueryAiSessionDto extends AiPaginationDto {
  @ApiPropertyOptional({ enum: AI_SESSION_STATUSES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(AI_SESSION_STATUSES, { message: 'status 必须是 active 或 closed' })
  status?: AiSessionStatus;
}
