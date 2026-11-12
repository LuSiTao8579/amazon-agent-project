-- 会话属于一个真实用户；删除用户前需要明确处理其会话。
CREATE TABLE ai_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL DEFAULT '新会话' CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_chat_sessions_user_updated_idx ON ai_chat_sessions(user_id, updated_at DESC, id);
CREATE TRIGGER ai_chat_sessions_set_updated_at BEFORE UPDATE ON ai_chat_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 消息按自增序号排序，同一时间产生的消息也有稳定顺序。
CREATE TABLE ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE RESTRICT,
  position bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'table', 'chart', 'report', 'confirmation')),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_chat_messages_session_position_idx ON ai_chat_messages(session_id, position);

-- 只记录附件元数据，不存文件本体；后续上传模块再定义存储方式和允许格式。
CREATE TABLE ai_chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES ai_chat_messages(id) ON DELETE RESTRICT,
  original_name text NOT NULL CHECK (char_length(btrim(original_name)) BETWEEN 1 AND 255),
  media_type text NOT NULL CHECK (char_length(btrim(media_type)) BETWEEN 1 AND 255),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  storage_key text NOT NULL UNIQUE CHECK (char_length(btrim(storage_key)) BETWEEN 1 AND 512),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_chat_attachments_message_idx ON ai_chat_attachments(message_id);
