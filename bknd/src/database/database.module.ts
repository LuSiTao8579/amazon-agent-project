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

/** 启动时检查数据库可连接，关闭应用时释放连接池。 */
@Injectable()
class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Database');

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onModuleInit() {
    // 尽早失败：数据库没启动或密码错误时，直接给出明确报错，而不是等到第一次请求。
    await this.pool.query('SELECT 1');
    this.logger.log('PostgreSQL connected');
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString = config.get<string>('DATABASE_URL');
        if (!connectionString)
          throw new Error('DATABASE_URL must be set in bknd/.env');
        return new pg.Pool({ connectionString, max: 10 });
      },
    },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
