import { ForbiddenException, type Type } from '@nestjs/common';
import { requireAdmin } from '../../admin.guard.js';
import { requireToolContext, type ToolContext } from '../../jwt-auth.guard.js';
import { aiDtoPipe } from '../dto/ai-dto.pipe.js';

export type ToolIntent = 'QUERY_DATA' | 'STATISTICS_ANALYSIS';
export type ToolPermission = 'users.read' | 'companies.read' | 'dashboard.read';

export abstract class BaseTool<Args extends object, Result> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly intent: ToolIntent;
  abstract readonly permission: ToolPermission;
  abstract readonly inputDto: Type<Args>;

  async execute(context: ToolContext | undefined, args: unknown): Promise<Result> {
    requireToolContext(context);
    switch (this.permission) {
      case 'users.read':
        requireAdmin(context.isAdmin);
        break;
      case 'companies.read':
      case 'dashboard.read':
        break;
      default:
        throw new ForbiddenException('未配置的工具操作权限');
    }
    const input: Args = await aiDtoPipe(this.inputDto).transform(args, { type: 'body' });
    return this.run(context, input);
  }

  protected abstract run(context: ToolContext, args: Args): Promise<Result>;
}
