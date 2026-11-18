import { Inject, Injectable, Scope, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { ToolOutput, ToolResult } from '../../../../contracts/tool-result.js';
import { requireToolContext, type ToolContext } from '../../jwt-auth.guard.js';
import { BaseTool } from './base-tool.js';
import { ToolPolicyService } from './tool-policy.service.js';
import { readToolMetadata, validateToolMetadata, type ToolIntent, type ToolMetadata } from './tool.decorator.js';
import { AiAuditService } from '../services/ai-audit.service.js';
import { AuditToolExecution } from './audit-tool-execution.decorator.js';
import { dispatchTool } from './tool-executor.js';
import { toolFailure } from './tool-result.js';

type Entry = { tool: BaseTool<object, ToolOutput>; meta: ToolMetadata };

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private entries = new Map<string, Entry>();

  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(ToolPolicyService) private readonly policy: ToolPolicyService,
    @Inject(AiAuditService) private readonly audit: AiAuditService) {}

  onModuleInit() {
    const entries = new Map<string, Entry>();
    for (const provider of this.discovery.getProviders()) {
      const target = provider.metatype;
      if (provider.isAlias || !target) continue;
      if (!(target.prototype instanceof BaseTool) && !readToolMetadata(target)) continue;
      const meta = validateToolMetadata(target);
      const tool = provider.instance;
      if (!provider.isDependencyTreeStatic() || provider.scope === Scope.TRANSIENT || !(tool instanceof BaseTool)) {
        throw new Error(`${meta.name} 必须是继承 BaseTool 的单例 provider`);
      }
      if (tool.execute !== BaseTool.prototype.execute || tool[dispatchTool] !== BaseTool.prototype[dispatchTool]) throw new Error(`${meta.name} 不可覆盖统一执行入口 execute`);
      if (typeof tool.inputDto !== 'function') throw new Error(`${meta.name} 缺少输入 DTO`);
      if (entries.has(meta.name)) throw new Error(`重复的工具名称：${meta.name}`);
      entries.set(meta.name, { tool, meta });
    }
    this.entries = entries;
  }

  private async visible(candidates: Entry[], context: ToolContext): Promise<ToolMetadata[]> {
    const admin = await this.policy.isCurrentAdmin(context);
    const permitted = candidates.filter(({ meta }) => this.policy.permits(admin, meta.permission));
    const enabled = await Promise.all(permitted.map(({ meta }) => this.policy.isEnabled(meta)));
    return permitted.filter((_, index) => enabled[index]).map(({ meta }) => meta);
  }

  async findByName(name: string, context: ToolContext): Promise<ToolMetadata | undefined> {
    const entry = this.entries.get(name);
    return (await this.visible(entry ? [entry] : [], context))[0];
  }

  listByIntent(intent: ToolIntent, context: ToolContext): Promise<ToolMetadata[]> {
    return this.visible([...this.entries.values()].filter(({ meta }) => meta.intent === intent), context);
  }

  @AuditToolExecution((registry: ToolRegistryService, name) => ({
    audit: registry.audit, tool: registry.entries.get(name)?.meta,
  }))
  async execute(name: string, context: ToolContext | undefined, args: unknown): Promise<ToolResult> {
    requireToolContext(context);
    const entry = this.entries.get(name);
    if (!entry) return toolFailure('TOOL_UNAVAILABLE');
    return entry.tool[dispatchTool](context, args);
  }
}
