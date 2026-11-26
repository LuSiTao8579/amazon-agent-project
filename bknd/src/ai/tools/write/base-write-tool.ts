import type { Type } from '@nestjs/common';
import type { ToolContext } from '../../../jwt-auth.guard.js';
import type { WritePrevalidationService, WriteTargetParam } from './write-prevalidation.service.js';
import type { WriteMetadata } from './write-tool.decorator.js';

export const executionClosed = async (_context: ToolContext | undefined, _args: object) => ({ code: 'WRITE_EXECUTION_DISABLED' } as const);
export const rollbackUnsupported = async (_context: ToolContext | undefined, _executionId: string) => ({ code: 'ROLLBACK_UNSUPPORTED' } as const);
const previewFields = ['role', 'status', 'level', 'city', 'country', 'companyName', 'name', 'employees', 'foundedYear'] as const;
type PreviewField = typeof previewFields[number];
export type WritePhase = 'validate' | 'preview';
const prepare = Symbol('prepare validated write proposal');

export abstract class BaseWriteTool<Args extends object> {
  abstract readonly inputDto: Type<Args>;
  readonly targetParam?: WriteTargetParam;
  protected abstract validate(context: ToolContext, args: Args, target?: string): Promise<void>;
  protected abstract getPreview(context: ToolContext, args: Args, target?: string): readonly PreviewField[];
  abstract execute(context: ToolContext | undefined, args: Args): ReturnType<typeof executionClosed>;
  abstract rollback(context: ToolContext | undefined, executionId: string): ReturnType<typeof rollbackUnsupported>;

  async [prepare](phase: WritePhase, context: ToolContext | undefined, raw: unknown, meta: WriteMetadata,
    prevalidation: WritePrevalidationService, target?: string) {
    const checked = await prevalidation.validate(context, phase, this.inputDto, raw, this.targetParam, target,
      (actor, dto, id) => this.validate(actor, dto, id));
    if (phase === 'validate') return { validated: true } as const;
    const requested = this.getPreview(checked.context, checked.args, target);
    return { operation: meta.operation, target: meta.target, changedFields: previewFields.filter(key => requested.includes(key)) };
  }
}

// 注册中心只保存此拦截器；它没有提交或回滚的调度分支。
export class WriteToolInterceptor {
  constructor(readonly meta: WriteMetadata, private readonly tool: BaseWriteTool<object>,
    private readonly prevalidation: WritePrevalidationService) {
    if (tool.execute !== executionClosed || tool.rollback !== rollbackUnsupported ||
      tool[prepare] !== BaseWriteTool.prototype[prepare] || typeof tool.inputDto !== 'function' ||
      typeof tool['validate'] !== 'function' || typeof tool['getPreview'] !== 'function') {
      throw new Error(meta.name + ' 写工具必须实现预校验和预览，并使用统一的关闭执行和回滚方法');
    }
  }

  prepare(phase: WritePhase, context: ToolContext | undefined, raw: unknown, target?: string) {
    return this.tool[prepare](phase, context, raw, this.meta, this.prevalidation, target);
  }
}
