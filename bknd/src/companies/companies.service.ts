import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
import { searchPattern } from '../common/list.dto.js';
import type { CompanyListDto, CreateCompanyDto, UpdateCompanyDto } from './company.dto.js';

const COLUMNS = `company_code AS "companyCode", company_name AS "companyName", level, country, city,
  founded_year AS "foundedYear", annual_revenue::float8 AS "annualRevenue", employees,
  (annual_revenue / NULLIF(employees, 0))::float8 AS "revenuePerEmployee",
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const FIELD_COLUMNS: Record<string, string> = {
  companyName: 'company_name', level: 'level', country: 'country', city: 'city',
  foundedYear: 'founded_year', annualRevenue: 'annual_revenue', employees: 'employees',
};

@Injectable()
export class CompaniesService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async list(query: CompanyListDto) {
    const args = [searchPattern(query.search), query.levels ?? null];
    const where = 'company_name ILIKE $1 AND ($2::int[] IS NULL OR level = ANY($2))';
    const count = await this.pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM companies WHERE ${where}`, args);
    const { rows } = await this.pool.query(
      `SELECT ${COLUMNS} FROM companies WHERE ${where} ORDER BY company_code LIMIT $3 OFFSET $4`,
      [...args, query.pageSize, (query.page - 1) * query.pageSize]);
    return { items: rows, total: count.rows[0].total, page: query.page, pageSize: query.pageSize };
  }

  async get(code: string) {
    const { rows } = await this.pool.query(`SELECT ${COLUMNS} FROM companies WHERE company_code = $1`, [code]);
    if (!rows[0]) throw new NotFoundException('公司不存在');
    return rows[0];
  }

  async create(input: CreateCompanyDto) {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO companies (company_code, company_name, level, country, city, founded_year, annual_revenue, employees)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLUMNS}`,
        [input.companyCode, input.companyName, input.level, input.country, input.city, input.foundedYear, input.annualRevenue, input.employees]);
      return rows[0];
    } catch (error) {
      if (error instanceof pg.DatabaseError && error.code === '23505') throw new ConflictException('公司编码已存在');
      throw error;
    }
  }

  async update(code: string, input: UpdateCompanyDto) {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    if (!entries.length) throw new BadRequestException('至少提供一个需要修改的字段');
    if (entries.some(([key]) => !Object.hasOwn(FIELD_COLUMNS, key))) throw new BadRequestException('不支持的修改字段');
    const columns = entries.map(([key], index) => `${FIELD_COLUMNS[key]} = $${index + 2}`).join(', ');
    const { rows } = await this.pool.query(
      `UPDATE companies SET ${columns} WHERE company_code = $1 RETURNING ${COLUMNS}`,
      [code, ...entries.map(([, value]) => value)]);
    if (!rows[0]) throw new NotFoundException('公司不存在');
    return rows[0];
  }

  async remove(code: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // 不自动级联删供应链关系。锁住公司，外键也会阻止并发插入悬空关联。
      const locked = await client.query('SELECT company_code FROM companies WHERE company_code = $1 FOR UPDATE', [code]);
      if (!locked.rows.length) throw new NotFoundException('公司不存在');
      const related = await client.query('SELECT 1 FROM relationships WHERE company_code = $1 OR parent_company = $1 LIMIT 1', [code]);
      if (related.rows.length) throw new ConflictException('公司仍有关联关系，不能删除；请先处理关系数据');
      await client.query('DELETE FROM companies WHERE company_code = $1', [code]);
      await client.query('COMMIT');
      return { deleted: 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof pg.DatabaseError && error.code === '23503') throw new ConflictException('公司仍有关联关系，不能删除');
      throw error;
    } finally { client.release(); }
  }
}
