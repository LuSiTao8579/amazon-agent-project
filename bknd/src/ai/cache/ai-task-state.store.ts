import { Inject, Injectable } from '@nestjs/common';
import { AiTaskService } from '../services/ai-task.service.js';
import { AiCacheService, type AiCacheValue } from './ai-cache.service.js';

/** 单个任务的最新临时快照，供后续执行器注入使用。 */
@Injectable()
export class AiTaskStateStore {
  constructor(
    @Inject(AiTaskService) private readonly tasks: AiTaskService,
    @Inject(AiCacheService) private readonly cache: AiCacheService,
  ) {}

  private async ownedKey(userId: string, taskId: string) {
    const task = await this.tasks.get(userId, taskId);
    return { kind: 'taskState', userId: task.userId, taskId: task.id } as const;
  }

  async write(userId: string, taskId: string, state: AiCacheValue, ttlSeconds?: number): Promise<void> {
    const key = await this.ownedKey(userId, taskId);
    await this.cache.set(key, state, ttlSeconds);
  }

  async read(userId: string, taskId: string): Promise<AiCacheValue | undefined> {
    const key = await this.ownedKey(userId, taskId);
    return this.cache.get(key);
  }

  async clear(userId: string, taskId: string): Promise<boolean> {
    const key = await this.ownedKey(userId, taskId);
    return this.cache.invalidate(key);
  }
}
