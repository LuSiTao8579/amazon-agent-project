import { Module } from '@nestjs/common';
import { AiCacheService } from './ai-cache.service.js';
import { AiSessionContextCache } from './ai-session-context.cache.js';

@Module({
  providers: [AiCacheService, AiSessionContextCache],
  exports: [AiCacheService, AiSessionContextCache],
})
export class AiCacheModule {}
