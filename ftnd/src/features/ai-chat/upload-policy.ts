/** 前端文件限制；调整时需同步 NestJS 的 chat-attachment.service.ts 与数据库约束。 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_EXTENSIONS = ['txt', 'md', 'csv', 'tsv', 'pdf', 'docx', 'xlsx'] as const;
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map(extension => `.${extension}`).join(',');
