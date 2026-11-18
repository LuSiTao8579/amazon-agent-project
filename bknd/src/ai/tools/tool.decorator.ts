import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common';

const intents = ['QUERY_DATA', 'STATISTICS_ANALYSIS'] as const;
const permissions = ['users.read', 'companies.read', 'dashboard.read'] as const;
export type ToolIntent = typeof intents[number];
export type ToolPermission = typeof permissions[number];
export type ToolMetadata = Readonly<{
  name: string; description: string; intent: ToolIntent; permission: ToolPermission; defaultEnabled?: boolean;
}>;

const key = Symbol('AI tool metadata');

export function Tool(metadata: ToolMetadata): ClassDecorator {
  return applyDecorators(Injectable(), SetMetadata(key, Object.freeze({ ...metadata })));
}

export function readToolMetadata(target: Function): ToolMetadata | undefined {
  return Reflect.getOwnMetadata(key, target);
}

export function validateToolMetadata(target: Function): ToolMetadata {
  const meta = readToolMetadata(target);
  if (!meta) throw new Error(`${target.name} 缺少 @Tool 元数据`);
  if (typeof meta.name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(meta.name)) throw new Error(`${target.name} 的工具名称无效`);
  if (typeof meta.description !== 'string' || !meta.description.trim()) throw new Error(`${meta.name} 缺少工具描述`);
  if (!intents.includes(meta.intent)) throw new Error(`${meta.name} 的工具意图无效`);
  if (!permissions.includes(meta.permission)) throw new Error(`${meta.name} 的工具权限无效`);
  if (meta.defaultEnabled !== undefined && typeof meta.defaultEnabled !== 'boolean') throw new Error(`${meta.name} 的默认开关无效`);
  return meta;
}
