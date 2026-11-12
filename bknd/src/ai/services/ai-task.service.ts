import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AI_DATA_SOURCE, type AiTaskStatus } from '../ai.constants.js';
import type { CreateAiTaskDto, QueryAiTaskDto, UpdateAiTaskDto } from '../dto/ai-task.dto.js';
import { AiTaskRecordEntity } from '../entities/ai-task-record.entity.js';
import { aiPage, type AiPage } from './ai-page.js';
import { requireAiResourceId, requireAiUserId } from './ai-access.js';

@Injectable()
export class AiTaskService {
  constructor(@InjectRepository(AiTaskRecordEntity, AI_DATA_SOURCE) private readonly records: Repository<AiTaskRecordEntity>) {}

  async create(userId: string, input: CreateAiTaskDto): Promise<AiTaskRecordEntity> {
    requireAiUserId(userId);
    return this.records.save(this.records.create({ userId, name: input.name }));
  }

  async list(userId: string, query: QueryAiTaskDto): Promise<AiPage<AiTaskRecordEntity>> {
    requireAiUserId(userId);
    const where = query.status ? { userId, status: query.status } : { userId };
    const rows = await this.records.find({
      where, order: { createdAt: 'DESC', id: 'ASC' },
      skip: (query.page - 1) * query.pageSize, take: query.pageSize + 1,
    });
    return aiPage(rows, query);
  }

  async get(userId: string, id: string): Promise<AiTaskRecordEntity> {
    requireAiUserId(userId);
    requireAiResourceId(id, '任务');
    const record = await this.records.findOneBy({ id, userId });
    if (!record) throw new NotFoundException('任务不存在');
    return record;
  }

  async update(userId: string, id: string, input: UpdateAiTaskDto): Promise<AiTaskRecordEntity> {
    requireAiUserId(userId);
    requireAiResourceId(id, '任务');
    const patch: { name?: string; status?: AiTaskStatus } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (Object.keys(patch).length === 0) throw new BadRequestException('至少提供 name 或 status');
    const result = await this.records.update({ id, userId }, patch);
    if (result.affected !== 1) throw new NotFoundException('任务不存在');
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<{ deleted: boolean }> {
    requireAiUserId(userId);
    requireAiResourceId(id, '任务');
    const result = await this.records.delete({ id, userId });
    if (result.affected !== 1) throw new NotFoundException('任务不存在');
    return { deleted: true };
  }
}
