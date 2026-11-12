-- 将小型开发附件与元数据保存在同一个数据库事务中；旧附件记录保持兼容。
ALTER TABLE ai_chat_attachments ADD COLUMN file_data bytea;
ALTER TABLE ai_chat_attachments ADD CONSTRAINT ai_chat_attachment_size_check
  CHECK (file_data IS NULL OR (octet_length(file_data) = byte_size AND byte_size BETWEEN 1 AND 5242880));
