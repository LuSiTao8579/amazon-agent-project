import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn, IsISO8601, IsString, IsUUID, Matches, MaxLength, NotContains, Validate,
  ValidateIf, ValidatorConstraint, type ValidationArguments, type ValidatorConstraintInterface,
} from 'class-validator';
import { AI_AUDIT_RESULTS, type AiAuditResult } from '../ai.constants.js';
import { AiPaginationDto } from './ai-common.dto.js';

/** 仅供服务端内部创建审计记录；操作者从可信上下文另行获取。 */
export class CreateAiAuditDto {
  @ApiProperty({ type: String, maxLength: 100, example: 'task.create' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'action 必须是字符串' })
  @Matches(/\S/u, { message: 'action 不能为空白' })
  @NotContains('\u0000', { message: 'action 不能包含空字符' })
  @MaxLength(100, { message: 'action 不能超过 100 个字符' })
  action!: string;

  @ApiProperty({ type: String, maxLength: 100, example: 'task' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'resourceType 必须是字符串' })
  @Matches(/\S/u, { message: 'resourceType 不能为空白' })
  @NotContains('\u0000', { message: 'resourceType 不能包含空字符' })
  @MaxLength(100, { message: 'resourceType 不能超过 100 个字符' })
  resourceType!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsUUID(undefined, { message: 'resourceId 必须是有效的 UUID 或 null' })
  resourceId?: string | null;

  @ApiProperty({ enum: AI_AUDIT_RESULTS })
  @IsIn(AI_AUDIT_RESULTS, { message: 'result 必须是 success 或 failure' })
  result!: AiAuditResult;
}

// 必须是带时区的完整时间，避免按服务器时区解释不明确的日期。
const DATE_TIME_WITH_ZONE = /^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/;

@ValidatorConstraint({ name: 'auditEndNotBeforeStart', async: false })
class AuditEndNotBeforeStart implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const from = (args.object as QueryAiAuditDto).from;
    if (typeof from !== 'string' || typeof value !== 'string') return true;
    const start = Date.parse(from);
    const end = Date.parse(value);
    return !Number.isFinite(start) || !Number.isFinite(end) || end >= start;
  }
  defaultMessage(): string { return 'to 不能早于 from'; }
}

/** 普通用户只能查自己；后续服务必须强制从 JWT 获取用户 ID。 */
export class QueryAiAuditDto extends AiPaginationDto {
  @ApiPropertyOptional({ enum: AI_AUDIT_RESULTS })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(AI_AUDIT_RESULTS, { message: 'result 必须是 success 或 failure' })
  result?: AiAuditResult;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: '含时区的开始时间（包含）' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString({ message: 'from 必须是字符串' })
  @Matches(DATE_TIME_WITH_ZONE, { message: 'from 必须是带时区的完整时间' })
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'from 不是有效日期' })
  from?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: '含时区的结束时间（包含）' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString({ message: 'to 必须是字符串' })
  @Matches(DATE_TIME_WITH_ZONE, { message: 'to 必须是带时区的完整时间' })
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'to 不是有效日期' })
  @Validate(AuditEndNotBeforeStart)
  to?: string;
}

/** 只能挂到受管理员守卫保护的查询；DTO 本身不具备鉴权能力。 */
export class AdminQueryAiAuditDto extends QueryAiAuditDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: '仅供管理员筛选用户' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'userId 必须是有效的 UUID' })
  userId?: string;
}
