-- 会话软删除：保留消息和附件，正常接口不再返回已删除会话。
ALTER TABLE ai_chat_sessions ADD COLUMN deleted_at timestamptz;
CREATE INDEX ai_chat_sessions_active_user_idx ON ai_chat_sessions(user_id, updated_at DESC, id) WHERE deleted_at IS NULL;
