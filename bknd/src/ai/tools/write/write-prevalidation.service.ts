import { BadRequestException, Inject, Injectable, ParseUUIDPipe, type Type } from '@nestjs/common';
import { requireAdmin } from '../../../admin.guard.js';
import { dtoPipe } from '../../../common/list.dto.js';
import { requireToolContext, type ToolContext } from '../../../jwt-auth.guard.js';
import { ToolPolicyService } from '../tool-policy.service.js';

export type WriteTargetParam = 'userId' | 'companyCode';
// 单删业务接口只读取路径参数。
export class NoWriteBody {}

@Injectable()
export class WritePrevalidationService {
  constructor(@Inject(ToolPolicyService) private readonly policy: ToolPolicyService) {}

  async validate<Args extends object>(context: ToolContext | undefined, phase: string, inputDto: Type<Args>, raw: unknown,
    param: WriteTargetParam | undefined, target: string | undefined,
    checkRules: (context: ToolContext, args: Args, target?: string) => Promise<void>) {
    requireToolContext(context);
    requireAdmin(await this.policy.isCurrentAdmin(context));
    if (phase !== 'validate' && phase !== 'preview') throw new BadRequestException('仅支持预校验和预览');
    if (param === 'userId') {
      await new ParseUUIDPipe().transform(target, { type: 'param', data: 'id' });
    } else if (param === 'companyCode' && typeof target !== 'string') {
      throw new BadRequestException('缺少公司编码');
    }
    const args: Args = inputDto === NoWriteBody ? new inputDto() : await dtoPipe(inputDto).transform(raw, { type: 'body' });
    await checkRules(context, args, target);
    return { context, args };
  }
}
