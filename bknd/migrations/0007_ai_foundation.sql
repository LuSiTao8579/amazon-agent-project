-- AI 会话扩展：复用现有会话身份和归属，不复制旧会话或聊天消息。
CREATE TABLE ai_chat_session (
  id uuid PRIMARY KEY REFERENCES ai_chat_sessions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_chat_session_status_chk CHECK (status IN ('active', 'closed'))
);
CREATE TRIGGER ai_chat_session_set_updated_at
BEFORE UPDATE ON ai_chat_session
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ai_user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_user_memory_content_chk CHECK (char_length(btrim(content)) BETWEEN 1 AND 10000)
);
CREATE INDEX ai_user_memory_user_updated_idx ON ai_user_memory(user_id, updated_at DESC, id);
CREATE TRIGGER ai_user_memory_set_updated_at
BEFORE UPDATE ON ai_user_memory
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ai_task_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_task_record_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT ai_task_record_status_chk CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);
CREATE INDEX ai_task_record_user_created_idx ON ai_task_record(user_id, created_at DESC, id);
CREATE INDEX ai_task_record_user_status_created_idx ON ai_task_record(user_id, status, created_at DESC, id);
CREATE TRIGGER ai_task_record_set_updated_at
BEFORE UPDATE ON ai_task_record
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 审计不引用业务对象，避免删除对象时破坏历史记录；用户仍通过外键保护。
CREATE TABLE ai_operation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_operation_audit_action_chk CHECK (char_length(btrim(action)) BETWEEN 1 AND 100),
  CONSTRAINT ai_operation_audit_resource_type_chk CHECK (char_length(btrim(resource_type)) BETWEEN 1 AND 100),
  CONSTRAINT ai_operation_audit_result_chk CHECK (result IN ('success', 'failure'))
);
CREATE INDEX ai_operation_audit_user_created_idx ON ai_operation_audit(user_id, created_at DESC, id);
CREATE INDEX ai_operation_audit_created_idx ON ai_operation_audit(created_at DESC, id);

-- 语句级触发器同时保护 UPDATE、DELETE 和 TRUNCATE，即使条件未命中记录。
-- 仍需在部署时将表所有者与应用账号分离并限制权限。
CREATE FUNCTION reject_ai_operation_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai_operation_audit is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER ai_operation_audit_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON ai_operation_audit
FOR EACH STATEMENT EXECUTE FUNCTION reject_ai_operation_audit_mutation();
