import type { ToolResult } from '../../../contracts/tool-result.js';
import { isIssuedToolContext, type ToolContext } from '../jwt-auth.guard.js';
import { toolFailure } from '../ai/tools/tool-result.js';
import { ChatMessageEntity, type ChatMessageType } from './entities/chat-message.entity.js';

export type TurnReply = { messageType: ChatMessageType; content: Record<string, unknown>; summary: string };

function summarize(result: ToolResult): string {
  if (result.code !== 'OK') return result.message;
  switch (result.resultType) {
    case 'table': {
      const { tableType, page, total, items } = result.data;
      return `${tableType === 'companies' ? '公司' : '用户'}查询共 ${total} 条，第 ${page} 页返回 ${items.length} 条。`;
    }
    case 'chart': return `${result.data.chartType === 'yearlyGrowth' ? '成立年份趋势' : '等级分布'}共有 ${result.data.rows.length} 个数据点。`;
    case 'report': return `Dashboard 汇总了 ${result.data.summary.companyCount} 家公司，覆盖 ${result.data.summary.countryCount} 个国家。`;
    case 'text': return result.data.text.slice(0, 500);
  }
}

export function toolTurnReply(result: ToolResult): TurnReply {
  const summary = summarize(result);
  return { messageType: result.resultType, content: { ...result, contextSummary: summary }, summary };
}

// 历史和 requestId 重放都按本次登录权限交付。旧版快照同样带有 tableType。
export function visibleMessage(message: ChatMessageEntity, context: ToolContext | undefined): ChatMessageEntity {
  const data = message.content.data;
  if (message.role === 'assistant' && message.messageType === 'table' && data && typeof data === 'object' &&
      'tableType' in data && data.tableType === 'users' && !(isIssuedToolContext(context) && context.isAdmin)) {
    return Object.assign(new ChatMessageEntity(), message, { messageType: 'text', content: toolFailure('FORBIDDEN') });
  }
  return message;
}
