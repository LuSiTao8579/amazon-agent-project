import 'reflect-metadata';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Type } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UserListDto } from '../../users/user-management.dto.js';
import { BaseTool } from './base-tool.js';
import { ToolPolicyService } from './tool-policy.service.js';
import { AiAuditService } from '../services/ai-audit.service.js';
import { TOOL_EXECUTOR } from './tool-executor.js';
import { ToolRegistryService } from './tool-registry.service.js';
import { Tool } from './tool.decorator.js';

class MissingMetadata extends BaseTool<UserListDto, { resultType: 'text'; data: { text: string } }> {
  readonly inputDto = UserListDto;
  protected async run() { return { resultType: 'text' as const, data: { text: 'ok' } }; }
}

const definition = { name: 'test_read', description: '测试', intent: 'QUERY_DATA', permission: 'companies.read' } as const;
@Tool(definition) class First extends MissingMetadata {}
@Tool(definition) class Second extends MissingMetadata {}
@Tool({ ...definition, description: '' }) class MissingDescription extends MissingMetadata {}

@Tool(definition) class OverridesEntry extends MissingMetadata {
  override async execute() { return { code: 'OK' as const, message: 'ok', ...await this.run() }; }
}

describe('工具注册时检查 provider', () => {
  it.each<[Type[], RegExp]>([
    [[First, Second], /重复的工具名称：test_read/], [[MissingMetadata], /缺少 @Tool/],
    [[MissingDescription], /缺少工具描述/], [[OverridesEntry], /不可覆盖统一执行入口/],
  ])('拒绝重复名称或缺失元数据', async (providers, error) => {
    const mod = await Test.createTestingModule({ imports: [DiscoveryModule], providers: [
      ToolRegistryService, { provide: AiAuditService, useValue: {} }, { provide: TOOL_EXECUTOR, useExisting: ToolRegistryService },
      { provide: ToolPolicyService, useValue: {} }, ...providers,
    ] }).compile();
    try { expect(() => mod.get(ToolRegistryService).onModuleInit()).toThrow(error); }
    finally { await mod.close(); }
  });
});
