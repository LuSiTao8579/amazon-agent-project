import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: new URL('../.env', import.meta.url) });
const [companyFile, relationshipFile] = process.argv.slice(2);
if (!companyFile || !relationshipFile || !process.env.DATABASE_URL) {
  throw new Error('用法：node scripts/import-companies.mjs 公司.csv 关系.csv；还需要配置 DATABASE_URL');
}
const read = async (file) => parse(await readFile(file), {
  columns: true, bom: true, skip_empty_lines: true,
});
const companies = await read(companyFile);
const relationships = await read(relationshipFile);
const codes = new Set();
for (const c of companies) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(c.company_code) || codes.has(c.company_code)
      || !c.company_name?.trim() || !c.country?.trim() || !c.city?.trim()
      || !/^\d+$/.test(c.level) || Number(c.level) < 1
      || !/^\d+$/.test(c.founded_year) || Number(c.founded_year) < 1 || Number(c.founded_year) > 9999
      || !/^\d+(\.\d{1,2})?$/.test(c.annual_revenue)
      || !/^\d+$/.test(c.employees)) throw new Error('公司数据格式无效或编码重复：' + c.company_code);
  codes.add(c.company_code);
}
const seen = new Set();
for (const r of relationships) {
  if (!codes.has(r.company_code) || seen.has(r.company_code)
      || (r.parent_company && (!codes.has(r.parent_company) || r.parent_company === r.company_code))) {
    throw new Error('公司关系无效或重复：' + r.company_code);
  }
  seen.add(r.company_code);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  // 事务确保任何一条导入失败时，不会留下半套公司或关系数据。
  await client.query('BEGIN');
  let companyCount = 0;
  let relationshipCount = 0;
  for (const c of companies) {
    const result = await client.query(
      'INSERT INTO companies (company_code,company_name,level,country,city,founded_year,annual_revenue,employees) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (company_code) DO NOTHING',
      [c.company_code,c.company_name,c.level,c.country,c.city,c.founded_year,c.annual_revenue,c.employees],
    );
    companyCount += result.rowCount;
  }
  for (const r of relationships) {
    const result = await client.query(
      'INSERT INTO relationships (company_code,parent_company) VALUES ($1,$2) ON CONFLICT (company_code) DO NOTHING',
      [r.company_code, r.parent_company || null],
    );
    relationshipCount += result.rowCount;
  }
  await client.query('COMMIT');
  console.log(`新增公司 ${companyCount} 条，关系 ${relationshipCount} 条；已存在的编码保持原值。`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
