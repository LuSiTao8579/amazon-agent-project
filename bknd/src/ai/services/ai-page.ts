import type { AiPaginationDto } from '../dto/ai-common.dto.js';

export interface AiPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 多取一条判断是否还有下一页，避免每次额外执行 count。 */
export function aiPage<T>(rows: T[], query: AiPaginationDto): AiPage<T> {
  return {
    items: rows.slice(0, query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    hasMore: rows.length > query.pageSize,
  };
}
