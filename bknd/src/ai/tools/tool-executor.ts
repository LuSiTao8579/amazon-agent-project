import type { ToolResult } from '../../../../contracts/tool-result.js';
import type { ToolContext } from '../../jwt-auth.guard.js';

export const TOOL_EXECUTOR = Symbol('audited tool executor');
export const dispatchTool = Symbol('registry-only dispatch');
export type ExecuteTool = (name: string, context: ToolContext | undefined, args: unknown) => Promise<ToolResult>;
