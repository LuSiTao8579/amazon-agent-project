import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

/** 注入 PostgreSQL 连接池时使用的令牌。 */
export const PG_POOL = Symbol('PG_POOL');
// 聊天回合持有会话锁等待模型；业务查询仍需能从独立的连接池取得连接。
export const CHAT_LOCK_POOL = Symbol('CHAT_LOCK_POOL');

function createPool(config: ConfigService) {
  const connectionString = config.get<string>('DATABASE_URL');
  if (!connectionString) throw new Error('DATABASE_URL must be set in bknd/.env');
  return new pg.Pool({ connectionString, max: 10 });
}

/** 启动时检查数据库可连接，关闭应用时释放连接池。 */
@Injectable()
class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Database');

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(CHAT_LOCK_POOL) private readonly locks: pg.Pool) {}

  async onModuleInit() {
    // 尽早失败：数据库没启动或密码错误时，直接给出明确报错，而不是等到第一次请求。
    await this.pool.query('SELECT 1');
    this.logger.log('PostgreSQL connected');
  }

  async onApplicationShutdown() {
    await Promise.all([this.pool.end(), this.locks.end()]);
  }
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL, inject: [ConfigService], useFactory: createPool },
    { provide: CHAT_LOCK_POOL, inject: [ConfigService], useFactory: createPool },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL, CHAT_LOCK_POOL],
})
export class DatabaseModule {}
