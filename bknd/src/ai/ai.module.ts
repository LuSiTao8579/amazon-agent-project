import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatSessionEntity } from './entities/ai-chat-session.entity.js';
import { AiUserMemoryEntity } from './entities/ai-user-memory.entity.js';
import { AiTaskRecordEntity } from './entities/ai-task-record.entity.js';
import { AiOperationAuditEntity } from './entities/ai-operation-audit.entity.js';

export const AI_DATA_SOURCE = 'ai';
export const AI_ENTITIES = [AiChatSessionEntity, AiUserMemoryEntity, AiTaskRecordEntity, AiOperationAuditEntity];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: AI_DATA_SOURCE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) throw new Error('DATABASE_URL must be set in bknd/.env');
        return {
          type: 'postgres' as const,
          url,
          entities: AI_ENTITIES,
          synchronize: false,
          migrationsRun: false,
          // 独立于既有 pg 池（最多 10 个连接），总预算最多 15 个。
          extra: { max: 5 },
        };
      },
    }),
    TypeOrmModule.forFeature(AI_ENTITIES, AI_DATA_SOURCE),
  ],
})
export class AiModule {}
