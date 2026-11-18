import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { AI_DATA_SOURCE } from './ai.constants.js';
import { AiOperationAuditEntity } from './entities/ai-operation-audit.entity.js';
import { AiAuditService } from './services/ai-audit.service.js';

@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([AiOperationAuditEntity], AI_DATA_SOURCE)],
  providers: [AiAuditService],
  exports: [AiAuditService],
})
export class AiAuditModule {}
