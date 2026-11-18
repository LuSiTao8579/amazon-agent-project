import { ForbiddenException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { requireToolContext, type ToolContext } from '../../jwt-auth.guard.js';
import { UsersService } from '../../users/users.service.js';
import { AiCacheService } from '../cache/ai-cache.service.js';
import type { ToolMetadata, ToolPermission } from './tool.decorator.js';

@Injectable()
export class ToolPolicyService {
  constructor(@Inject(UsersService) private readonly users: UsersService,
    @Inject(AiCacheService) private readonly cache: AiCacheService) {}

  async isCurrentAdmin(context: ToolContext): Promise<boolean> {
    requireToolContext(context);
    const actor = await this.users.findById(context.userId);
    if (!actor || actor.status !== 'active') throw new UnauthorizedException('登录状态已失效');
    return context.isAdmin && actor.isAdmin;
  }

  permits(isAdmin: boolean, permission: ToolPermission): boolean {
    return permission === 'companies.read' || permission === 'dashboard.read' || (permission === 'users.read' && isAdmin);
  }

  isEnabled(meta: ToolMetadata): Promise<boolean> {
    return this.cache.isToolEnabled(meta.name, meta.defaultEnabled ?? true);
  }

  async requireExecution(context: ToolContext, meta: ToolMetadata) {
    if (!this.permits(await this.isCurrentAdmin(context), meta.permission)) throw new ForbiddenException();
    if (!await this.isEnabled(meta)) throw new ServiceUnavailableException();
  }
}
