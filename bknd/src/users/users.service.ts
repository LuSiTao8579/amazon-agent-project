import { ConflictException, Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
import {
  normalizeEmail,
  type PublicUser,
  type UserCredentials,
} from './user.types.js';

export const PUBLIC_COLUMNS =
  'id, email, name, role, status, is_admin AS "isAdmin", created_at AS "createdAt", updated_at AS "updatedAt"';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** PostgreSQL 唯一约束冲突的错误码。 */
const UNIQUE_VIOLATION = '23505';

/**
 * 用户数据访问：创建、按邮箱查找、按 id 读取。
 * 所有 SQL 使用参数化查询（$1、$2），不拼接用户输入，避免 SQL 注入。
 */
@Injectable()
export class UsersService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /**
   * 保存新用户。调用方必须先用 PasswordHasher 生成哈希，这里只接收哈希。
   * 不先查后插：直接依赖数据库唯一约束，并发注册同一邮箱时也只有一个能成功。
   */
  async create(input: {
    email: string;
    passwordHash: string;
    name?: string;
    role?: string;
    status?: string;
  }): Promise<PublicUser> {
    try {
      const { rows } = await this.pool.query<PublicUser>(
        `INSERT INTO users (email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, $5)
         RETURNING ${PUBLIC_COLUMNS}`,
        [normalizeEmail(input.email), input.passwordHash, input.name ?? '', input.role ?? 'Member', input.status ?? 'active'],
      );
      return rows[0];
    } catch (error) {
      if (
        error instanceof pg.DatabaseError &&
        error.code === UNIQUE_VIOLATION &&
        error.constraint === 'users_email_key'
      )
        throw new ConflictException('Email already registered');
      throw error;
    }
  }

  async findByEmail(email: string): Promise<PublicUser | null> {
    const { rows } = await this.pool.query<PublicUser>(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE email = $1`,
      [normalizeEmail(email)],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<PublicUser | null> {
    // 非 UUID 格式直接视为不存在，避免 PostgreSQL 抛类型错误变成 500。
    if (!UUID_PATTERN.test(id)) return null;
    const { rows } = await this.pool.query<PublicUser>(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** 登录时取出密码哈希做校验；结果不能直接返回给前端。 */
  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const { rows } = await this.pool.query<UserCredentials>(
      `SELECT id, email, password_hash AS "passwordHash"
       FROM users WHERE email = $1`,
      [normalizeEmail(email)],
    );
    return rows[0] ?? null;
  }
}
