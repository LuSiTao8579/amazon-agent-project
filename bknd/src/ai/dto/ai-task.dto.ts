import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsIn, IsString, Matches, MaxLength, NotContains, ValidateIf } from 'class-validator';
import { AI_TASK_STATUSES, type AiTaskStatus } from '../ai.constants.js';
import { AiPaginationDto } from './ai-common.dto.js';

export class CreateAiTaskDto {
  @ApiProperty({ type: String, maxLength: 200, example: '查询公司信息' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'name 必须是字符串' })
  @Matches(/\S/u, { message: 'name 不能为空白' })
  @NotContains('\u0000', { message: 'name 不能包含空字符' })
  @MaxLength(200, { message: 'name 不能超过 200 个字符' })
  name!: string;
}

/** name 和 status 可分别修改，但至少要有一个；不接受 null。 */
export class UpdateAiTaskDto {
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @ValidateIf((object: UpdateAiTaskDto, value: unknown) => value !== undefined || object.status === undefined)
  @IsDefined({ message: '至少提供 name 或 status' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'name 必须是字符串' })
  @Matches(/\S/u, { message: 'name 不能为空白' })
  @NotContains('\u0000', { message: 'name 不能包含空字符' })
  @MaxLength(200, { message: 'name 不能超过 200 个字符' })
  name?: string;

  @ApiPropertyOptional({ enum: AI_TASK_STATUSES })
  @ValidateIf((object: UpdateAiTaskDto, value: unknown) => value !== undefined || object.name === undefined)
  @IsDefined({ message: '至少提供 name 或 status' })
  @IsIn(AI_TASK_STATUSES, { message: 'status 不是允许的任务状态' })
  status?: AiTaskStatus;
}

export class QueryAiTaskDto extends AiPaginationDto {
  @ApiPropertyOptional({ enum: AI_TASK_STATUSES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(AI_TASK_STATUSES, { message: 'status 不是允许的任务状态' })
  status?: AiTaskStatus;
}
