import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AI_DATA_SOURCE } from '../ai.constants.js';
import type { CreateAiMemoryDto, QueryAiMemoryDto, UpdateAiMemoryDto } from '../dto/ai-memory.dto.js';
import { AiUserMemoryEntity } from '../entities/ai-user-memory.entity.js';
import { aiPage, type AiPage } from './ai-page.js';
import { requireAiResourceId, requireAiUserId } from './ai-access.js';

@Injectable()
export class AiMemoryService {
  constructor(@InjectRepository(AiUserMemoryEntity, AI_DATA_SOURCE) private readonly records: Repository<AiUserMemoryEntity>) {}

  async create(userId: string, input: CreateAiMemoryDto): Promise<AiUserMemoryEntity> {
    requireAiUserId(userId);
    return this.records.save(this.records.create({ userId, content: input.content }));
  }

  async list(userId: string, query: QueryAiMemoryDto): Promise<AiPage<AiUserMemoryEntity>> {
    requireAiUserId(userId);
    const rows = await this.records.find({
      where: { userId }, order: { updatedAt: 'DESC', id: 'ASC' },
      skip: (query.page - 1) * query.pageSize, take: query.pageSize + 1,
    });
    return aiPage(rows, query);
  }

  async get(userId: string, id: string): Promise<AiUserMemoryEntity> {
    requireAiUserId(userId);
    requireAiResourceId(id, '记忆');
    const record = await this.records.findOneBy({ id, userId });
    if (!record) throw new NotFoundException('记忆不存在');
    return record;
  }

  async update(userId: string, id: string, input: UpdateAiMemoryDto): Promise<AiUserMemoryEntity> {
    requireAiUserId(userId);
    requireAiResourceId(id, '记忆');
    const result = await this.records.update({ id, userId }, { content: input.content });
    if (result.affected !== 1) throw new NotFoundException('记忆不存在');
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<{ deleted: boolean }> {
    requireAiUserId(userId);
    requireAiResourceId(id, '记忆');
    const result = await this.records.delete({ id, userId });
    if (result.affected !== 1) throw new NotFoundException('记忆不存在');
    return { deleted: true };
  }
}
