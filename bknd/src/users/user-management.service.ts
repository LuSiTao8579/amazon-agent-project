import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
import { searchPattern } from '../common/list.dto.js';
import { PasswordHasher } from './password-hasher.service.js';
import { UsersService, PUBLIC_COLUMNS } from './users.service.js';
import type { PublicUser } from './user.types.js';
import type { CreateUserDto, UpdateUserDto, UserListDto } from './user-management.dto.js';

@Injectable()
export class UserManagementService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher) {}

  async list(query: UserListDto) {
    const values = [searchPattern(query.search), query.roles ?? null];
    const where = 'name ILIKE $1 AND ($2::text[] IS NULL OR role = ANY($2))';
    const count = await this.pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM users WHERE ${where}`, values);
    const { rows } = await this.pool.query<PublicUser>(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE ${where} ORDER BY created_at DESC, id LIMIT $3 OFFSET $4`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize]);
    return { items: rows, total: count.rows[0].total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async create(input: CreateUserDto) {
    // 只传递明确需要的字段；明文密码不会传给数据库层。
    return this.users.create({
      email: input.email,
      name: input.name,
      role: input.role,
      status: input.status,
      passwordHash: await this.hasher.hash(input.password),
    });
  }

  async update(id: string, input: UpdateUserDto) {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    if (!entries.length) throw new BadRequestException('至少提供一个需要修改的字段');
    // 列名来自 DTO 固定白名单，值使用参数；不允许用请求字段拼任意 SQL。
    const allowed = new Set(['name', 'email', 'role', 'status']);
    if (entries.some(([key]) => !allowed.has(key))) throw new BadRequestException('不支持的修改字段');
    const assignments = entries.map(([key], index) => `${key} = $${index + 2}`).join(', ');
    try {
      const { rows } = await this.pool.query<PublicUser>(
        `UPDATE users SET ${assignments} WHERE id = $1 AND NOT is_admin RETURNING ${PUBLIC_COLUMNS}`,
        [id, ...entries.map(([, value]) => value)]);
      if (!rows[0]) {
        await this.get(id);
        throw new ForbiddenException('管理员账号不能通过用户管理页面编辑');
      }
      return rows[0];
    } catch (error) {
      if (error instanceof pg.DatabaseError && error.code === '23505') throw new ConflictException('该邮箱已注册');
      throw error;
    }
  }

  async remove(ids: string[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // 锁定并完整检查后才删除，避免批量操作删除一半才发现另一条不允许删除。
      const { rows } = await client.query<{ id: string; is_admin: boolean }>(
        'SELECT id, is_admin FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
      if (rows.length !== ids.length) throw new NotFoundException('部分用户不存在，请刷新列表');
      if (rows.some((user) => user.is_admin)) throw new ForbiddenException('不能删除管理员账号');
      const result = await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
      await client.query('COMMIT');
      return { deleted: result.rowCount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
