-- 0001: 用户表。由 `npm run db:migrate` 在事务中执行，执行记录写入 schema_migrations。
-- 不要修改已经执行过的迁移文件；后续结构变化请新增 0002_xxx.sql。

CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- 应用层会先 trim + 小写；数据库再兜底，保证 A@x.com 与 a@x.com 不能并存。
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_email_normalized_chk CHECK (email = lower(btrim(email)) AND email <> ''),
  -- 只允许保存 Argon2id 的 PHC 格式哈希，防止误把明文密码写进来。
  CONSTRAINT users_password_hash_format_chk CHECK (password_hash LIKE '$argon2id$%')
);

-- 任何 UPDATE 都自动刷新 updated_at，避免依赖每条 SQL 手动设置。
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
