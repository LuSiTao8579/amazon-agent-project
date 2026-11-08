import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const formats: Record<string, string> = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
type Upload = { originalname: string; buffer: Buffer; size: number };

@Injectable()
export class ChatAttachmentService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async upload(userId: string, sessionId: string, file?: Upload) {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.size || file.size > MAX_ATTACHMENT_BYTES)
      throw new BadRequestException('请选择不超过 5 MB 的非空文件');
    const name = file.originalname.normalize('NFC');
    const ext = extname(name).toLowerCase();
    const mediaType = formats[ext];
    if (!mediaType || name.length > 200 || Array.from(name).some(char => char === '/' || char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
      throw new BadRequestException('文件名或格式不支持');
    // 只做基本文件签名/文本编码检查；不把上传文件当作可信内容执行。
    if (['.txt', '.md', '.csv', '.tsv'].includes(ext)) {
      try { new TextDecoder('utf-8', { fatal: true }).decode(file.buffer); }
      catch { throw new BadRequestException('文字和表格文件必须使用 UTF-8 编码'); }
      if (file.buffer.includes(0)) throw new BadRequestException('文件内容不是有效文本');
    } else if (ext === '.pdf' && file.buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new BadRequestException('PDF 文件格式不正确');
    } else if ((ext === '.docx' || ext === '.xlsx') && file.buffer.subarray(0, 4).toString('hex') !== '504b0304') {
      throw new BadRequestException('Office 文件格式不正确');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const owner = await client.query('UPDATE ai_chat_sessions SET updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id', [sessionId, userId]);
      if (!owner.rowCount) throw new NotFoundException('会话不存在');
      const message = await client.query<{id:string}>(`INSERT INTO ai_chat_messages(session_id,role,message_type,content)
        VALUES($1,'user','text',jsonb_build_object('text','附件已保存；当前不会自动交给模型分析。')) RETURNING id`, [sessionId]);
      const attachment = await client.query(`INSERT INTO ai_chat_attachments(message_id,original_name,media_type,byte_size,storage_key,file_data)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id, original_name AS "name", media_type AS "mediaType", byte_size AS "size"`,
        [message.rows[0].id, name, mediaType, file.size, 'db:' + randomUUID(), file.buffer]);
      await client.query('COMMIT');
      return { messageId: message.rows[0].id, attachment: attachment.rows[0] };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async download(userId: string, sessionId: string, attachmentId: string) {
    const { rows } = await this.pool.query<{original_name:string; file_data:Buffer|null}>(`
      SELECT a.original_name,a.file_data FROM ai_chat_attachments a
      JOIN ai_chat_messages m ON m.id=a.message_id JOIN ai_chat_sessions s ON s.id=m.session_id
      WHERE s.user_id=$1 AND s.id=$2 AND s.deleted_at IS NULL AND a.id=$3`, [userId, sessionId, attachmentId]);
    if (!rows[0]?.file_data) throw new NotFoundException('附件不存在');
    return rows[0];
  }
}
