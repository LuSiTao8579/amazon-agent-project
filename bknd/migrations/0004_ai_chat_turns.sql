-- 一轮对话记录请求编号和状态，避免同一请求编号重复生成并支持识别失败。
CREATE TABLE ai_chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  user_message_id uuid NOT NULL UNIQUE REFERENCES ai_chat_messages(id) ON DELETE RESTRICT,
  assistant_message_id uuid UNIQUE REFERENCES ai_chat_messages(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending','completed','failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_chat_turn_request_unique UNIQUE(session_id, request_id),
  CONSTRAINT ai_chat_turn_state CHECK (
    (status = 'pending' AND assistant_message_id IS NULL AND error_code IS NULL) OR
    (status = 'completed' AND assistant_message_id IS NOT NULL AND error_code IS NULL) OR
    (status = 'failed' AND assistant_message_id IS NULL AND error_code IS NOT NULL)
  )
);
CREATE INDEX ai_chat_turns_session_created_idx ON ai_chat_turns(session_id, created_at DESC);
CREATE TRIGGER ai_chat_turns_set_updated_at BEFORE UPDATE ON ai_chat_turns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
