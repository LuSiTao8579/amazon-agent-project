import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common';

const key = Symbol('AI write tool');
const targets = ['user', 'company'] as const;
const operations = ['create', 'update', 'delete', 'batchDelete'] as const;
type Definition = Readonly<{ name: string; target: typeof targets[number]; operation: typeof operations[number] }>;
export type WriteMetadata = Definition & Readonly<{ kind: 'write'; autoExecute: false }>;

export function WriteTool({ name, target, operation }: Definition): ClassDecorator {
  if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(name) || !targets.includes(target) || !operations.includes(operation)) {
    throw new Error('写工具元数据无效');
  }
  const meta: WriteMetadata = Object.freeze({ name, target, operation, kind: 'write', autoExecute: false });
  return applyDecorators(Injectable(), SetMetadata(key, meta));
}

export function writeMetadata(target: Function): WriteMetadata | undefined {
  return Reflect.getOwnMetadata(key, target);
}
