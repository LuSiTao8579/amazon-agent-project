import { ForbiddenException, type Type } from '@nestjs/common';
import { requireAdmin } from '../../admin.guard.js';
import { requireToolContext, type ToolContext } from '../../jwt-auth.guard.js';
import { aiDtoPipe } from '../dto/ai-dto.pipe.js';

import type { ToolOutput, ToolResult } from '../../../../contracts/tool-result.js';
import { invalidToolArgs, toolErrorResult } from './tool-result.js';

export type ToolIntent = 'QUERY_DATA' | 'STATISTICS_ANALYSIS';
export type ToolPermission = 'users.read' | 'companies.read' | 'dashboard.read';

export abstract class BaseTool<Args extends object, Result extends ToolOutput> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly intent: ToolIntent;
  abstract readonly permission: ToolPermission;
  abstract readonly inputDto: Type<Args>;

  async execute(context: ToolContext | undefined, args: unknown): Promise<ToolResult<Result>> {
    try {
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
      const input: Args = await aiDtoPipe(this.inputDto, invalidToolArgs).transform(args, { type: 'body' });
      const output = await this.run(context, input);
      return { ...output, code: 'OK', message: '查询成功。' };
    } catch (error) {
      return toolErrorResult(error);
    }
  }

  protected abstract run(context: ToolContext, args: Args): Promise<Result>;
}
