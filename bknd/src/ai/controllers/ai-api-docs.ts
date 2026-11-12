import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthErrorDto } from '../../auth/auth.dto.js';
import type { Request } from 'express';
import type { PublicUser } from '../../users/user.types.js';

/** JwtAuthGuard 校验后填入 user；调用方不得从请求参数中取所有者。 */
export type AiAuthenticatedRequest = Request & { user: PublicUser };

export function ApiAiAuth() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ type: AuthErrorDto, description: '需要有效登录凭证' }),
    ApiBadRequestResponse({ type: AuthErrorDto, description: '参数格式或取值不合法' }),
  );
}

export function ApiAiPaging() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, maximum: 1000000, description: '页码，默认 1' }),
    ApiQuery({ name: 'pageSize', required: false, type: Number, minimum: 1, maximum: 100, description: '每页数量，默认 10' }),
  );
}

export function ApiAiId() {
  return ApiParam({ name: 'id', type: String, format: 'uuid', description: '资源 ID' });
}
