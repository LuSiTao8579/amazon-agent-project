ALTER TABLE ai_operation_audit
  ADD COLUMN tool_name text,
  ADD COLUMN input_params jsonb,
  ADD COLUMN result_summary jsonb,
  ADD COLUMN ip inet,
  ALTER COLUMN user_id DROP NOT NULL,
  ADD CONSTRAINT ai_tool_audit_actor_chk CHECK (
    user_id IS NOT NULL OR (
      resource_type = 'tool' AND tool_name IS NOT NULL AND result = 'failure'
      AND ip IS NULL AND (result_summary->>'code') IS NOT DISTINCT FROM 'UNAUTHENTICATED'
    )
  );
