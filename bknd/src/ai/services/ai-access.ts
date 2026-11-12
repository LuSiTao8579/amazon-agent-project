import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { isUUID } from 'class-validator';

/** TypeORM 可能忽略 undefined 条件，必须先拒绝缺失的认证身份。 */
export function requireAiUserId(userId: unknown): asserts userId is string {
  if (typeof userId !== 'string' || !isUUID(userId)) {
    throw new UnauthorizedException('需要有效的登录用户');
  }
}

/** 防止缺失 ID 时查询或修改匹配到不该操作的其他记录。 */
export function requireAiResourceId(id: unknown, resource: string): asserts id is string {
  if (typeof id !== 'string' || !isUUID(id)) {
    throw new NotFoundException(`${resource}不存在`);
  }
}
