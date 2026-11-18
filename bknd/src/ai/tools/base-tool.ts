import { Inject, type Type } from '@nestjs/common';
import { TOOL_EXECUTOR, dispatchTool, type ExecuteTool } from './tool-executor.js';
import { ToolPolicyService } from './tool-policy.service.js';
import { validateToolMetadata } from './tool.decorator.js';
import { requireToolContext, type ToolContext } from '../../jwt-auth.guard.js';
import { aiDtoPipe } from '../dto/ai-dto.pipe.js';

import type { ToolOutput, ToolResult } from '../../../../contracts/tool-result.js';
import { invalidToolArgs, toolErrorResult } from './tool-result.js';

export abstract class BaseTool<Args extends object, Result extends ToolOutput> {
  @Inject(ToolPolicyService) private readonly policy: ToolPolicyService;
  @Inject(TOOL_EXECUTOR) private readonly registry: { execute: ExecuteTool };
  abstract readonly inputDto: Type<Args>;

  async execute(context: ToolContext | undefined, args: unknown): Promise<ToolResult<Result>> {
    // 已注册的唯一名称绑定本工具；直接注入的调用方也走同一条审计路径。
    return this.registry.execute(validateToolMetadata(this.constructor).name, context, args) as Promise<ToolResult<Result>>;
  }

  async [dispatchTool](context: ToolContext | undefined, args: unknown): Promise<ToolResult<Result>> {
    try {
      requireToolContext(context);
      await this.policy.requireExecution(context, validateToolMetadata(this.constructor));
      const input: Args = await aiDtoPipe(this.inputDto, invalidToolArgs).transform(args, { type: 'body' });
      const output = await this.run(context, input);
      return { ...output, code: 'OK', message: '查询成功。' };
    } catch (error) {
      return toolErrorResult(error);
    }
  }

  protected abstract run(context: ToolContext, args: Args): Promise<Result>;
}
