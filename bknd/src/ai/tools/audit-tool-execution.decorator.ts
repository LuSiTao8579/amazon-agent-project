import { Logger } from '@nestjs/common';
import type { AiAuditService } from '../services/ai-audit.service.js';
import type { ToolMetadata } from './tool.decorator.js';
import type { ExecuteTool } from './tool-executor.js';
import { redactToolArgs } from './tool-audit-data.js';
import { toolErrorResult, toolFailure } from './tool-result.js';

export function AuditToolExecution<T>(resolve: (owner: T, name: string) => { audit: AiAuditService; tool?: ToolMetadata }) {
  return (_target: T, _key: string, descriptor: TypedPropertyDescriptor<ExecuteTool>) => {
    const execute = descriptor.value!;
    descriptor.value = async function (this: T, name, context, args) {
      const { audit, tool } = resolve(this, name);
      const input = redactToolArgs(args);
      let outcome;
      try {
        outcome = await execute.call(this, name, context, args);
      } catch (error) {
        outcome = toolErrorResult(error);
      }
      try {
        await audit.recordToolExecution(context, tool, input, outcome);
      } catch {
        Logger.error('工具审计写入失败', 'ToolRegistryService');
        return toolFailure('EXECUTION_FAILED');
      }
      return outcome;
    };
  };
}
