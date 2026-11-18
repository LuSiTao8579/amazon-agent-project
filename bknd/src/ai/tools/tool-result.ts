import { BadRequestException, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ToolErrorCode, ToolFailure } from '../../../../contracts/tool-result.js';

const errorMessages: Record<ToolErrorCode, string> = {
  INVALID_ARGUMENTS: '查询参数不正确，请检查后重试。',
  UNAUTHENTICATED: '请先登录后再查询。',
  FORBIDDEN: '你没有权限执行此查询。',
  TOOL_UNAVAILABLE: '该工具暂不可用，请稍后再试。',
  EXECUTION_FAILED: '查询未完成，请稍后重试。',
};

export function toolFailure(code: ToolErrorCode): ToolFailure {
  return { code, data: null, message: errorMessages[code], resultType: 'text' };
}

// 仅这里生成的校验提示可展示。Service 和数据库抛出的异常文本不进入结果。
class ToolArgumentError extends BadRequestException {}

export function invalidToolArgs(errors: ValidationError[]): BadRequestException {
  const first = errors[0];
  if (first?.constraints?.whitelistValidation) return new ToolArgumentError('包含不支持的参数，请检查查询条件。');
  if (first?.constraints?.orderedYears) return new ToolArgumentError('结束年份不能早于起始年份。');
  const hints: Record<string, string> = {
    page: '页码须为 1 至 1000000 的整数。', pageSize: '每页条数须为 1 至 100 的整数。',
    foundedYearFrom: '起始年份须为 1 至 9999 的整数。', foundedYearTo: '结束年份须为 1 至 9999 的整数。',
    view: '请选择综合报表、等级占比或成立年份趋势。', sortBy: '该查询不支持所选排序字段。', sortOrder: '排序方向须为 asc 或 desc。',
    roles: '请选择有效岗位。', status: '账号状态须为 active 或 inactive。', levels: '请选择有效的公司等级。', search: '搜索关键词须为不超过 100 字的文本。',
  };
  const hint = first && Object.hasOwn(hints, first.property) ? hints[first.property] : errorMessages.INVALID_ARGUMENTS;
  return new ToolArgumentError(hint);
}

export function toolErrorResult(error: unknown): ToolFailure {
  if (error instanceof ToolArgumentError) return { ...toolFailure('INVALID_ARGUMENTS'), message: error.message };
  if (error instanceof BadRequestException) return toolFailure('INVALID_ARGUMENTS');
  if (error instanceof UnauthorizedException) return toolFailure('UNAUTHENTICATED');
  if (error instanceof ForbiddenException) return toolFailure('FORBIDDEN');
  if (error instanceof ServiceUnavailableException) return toolFailure('TOOL_UNAVAILABLE');
  return toolFailure('EXECUTION_FAILED');
}
