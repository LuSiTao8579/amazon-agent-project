-- 增量迁移：只扩展现有用户，不重建表，不改已有邮箱/密码哈希。
ALTER TABLE users
  ADD COLUMN name text NOT NULL DEFAULT '',
  ADD COLUMN role text NOT NULL DEFAULT 'Member' CHECK (role IN ('Member','Manager','Analyst')),
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
-- 旧账号没有姓名，保留空值，页面显示“未设置”；不从邮箱猜测姓名。
CREATE INDEX users_role_idx ON users(role);

CREATE TABLE companies (
  company_code text PRIMARY KEY,
  company_name text NOT NULL CHECK (btrim(company_name) <> ''),
  level integer NOT NULL CHECK (level > 0),
  country text NOT NULL CHECK (btrim(country) <> ''),
  city text NOT NULL CHECK (btrim(city) <> ''),
  founded_year integer NOT NULL CHECK (founded_year BETWEEN 1 AND 9999),
  annual_revenue numeric(18,2) NOT NULL CHECK (annual_revenue >= 0),
  employees integer NOT NULL CHECK (employees >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_code_format CHECK (company_code ~ '^[A-Za-z0-9_-]{1,64}$')
);
CREATE INDEX companies_level_idx ON companies(level);
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 两列都引用公司编码；NULL表示根公司，而不是空字符串。
-- RESTRICT保留依赖关系：删除公司必须先明确处理关系，不能悄悄级联删除。
CREATE TABLE relationships (
  company_code text PRIMARY KEY REFERENCES companies(company_code) ON DELETE RESTRICT,
  parent_company text REFERENCES companies(company_code) ON DELETE RESTRICT,
  CONSTRAINT relationship_not_self CHECK (company_code <> parent_company)
);
CREATE INDEX relationships_parent_idx ON relationships(parent_company);
