import { Inject, type Type } from '@nestjs/common';
import { ToolPolicyService } from './tool-policy.service.js';
import { validateToolMetadata } from './tool.decorator.js';
import { requireToolContext, type ToolContext } from '../../jwt-auth.guard.js';
import { aiDtoPipe } from '../dto/ai-dto.pipe.js';

import type { ToolOutput, ToolResult } from '../../../../contracts/tool-result.js';
import { invalidToolArgs, toolErrorResult } from './tool-result.js';

export abstract class BaseTool<Args extends object, Result extends ToolOutput> {
  @Inject(ToolPolicyService) private readonly policy: ToolPolicyService;
  abstract readonly inputDto: Type<Args>;

  async execute(context: ToolContext | undefined, args: unknown): Promise<ToolResult<Result>> {
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
