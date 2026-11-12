import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/users.service.js';
import { AI_DATA_SOURCE } from '../ai.constants.js';
import type { AdminQueryAiAuditDto, CreateAiAuditDto, QueryAiAuditDto } from '../dto/ai-audit.dto.js';
import { AiOperationAuditEntity } from '../entities/ai-operation-audit.entity.js';
import { aiPage, type AiPage } from './ai-page.js';
import { requireAiResourceId, requireAiUserId } from './ai-access.js';

@Injectable()
export class AiAuditService {
  constructor(
    @InjectRepository(AiOperationAuditEntity, AI_DATA_SOURCE) private readonly records: Repository<AiOperationAuditEntity>,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  /** 仅供可信服务端调用；userId 必须来自认证上下文。 */
  async create(userId: string, input: CreateAiAuditDto): Promise<AiOperationAuditEntity> {
    requireAiUserId(userId);
    return this.records.save(this.records.create({
      userId, action: input.action, resourceType: input.resourceType,
      resourceId: input.resourceId ?? null, result: input.result,
    }));
  }

  async listMine(userId: string, query: QueryAiAuditDto): Promise<AiPage<AiOperationAuditEntity>> {
    requireAiUserId(userId);
    return this.listScoped(query, { kind: 'user', userId });
  }

  async getMine(userId: string, id: string): Promise<AiOperationAuditEntity> {
    requireAiUserId(userId);
    requireAiResourceId(id, '审计记录');
    const record = await this.records.findOneBy({ id, userId });
    if (!record) throw new NotFoundException('审计记录不存在');
    return record;
  }

  /** 不信任调用方传入的角色标记，每次从用户表确认当前管理员状态。 */
  async listAll(actorId: string, query: AdminQueryAiAuditDto): Promise<AiPage<AiOperationAuditEntity>> {
    await this.requireAdmin(actorId);
    return this.listScoped(query, { kind: 'admin', userId: query.userId });
  }

  async getAsAdmin(actorId: string, id: string): Promise<AiOperationAuditEntity> {
    await this.requireAdmin(actorId);
    requireAiResourceId(id, '审计记录');
    const record = await this.records.findOneBy({ id });
    if (!record) throw new NotFoundException('审计记录不存在');
    return record;
  }

  private async requireAdmin(userId: string): Promise<void> {
    requireAiUserId(userId);
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active' || !user.isAdmin) throw new ForbiddenException('此操作需要管理员权限');
  }

  private async listScoped(query: QueryAiAuditDto, scope: { kind: 'user'; userId: string } | { kind: 'admin'; userId?: string }): Promise<AiPage<AiOperationAuditEntity>> {
    const builder = this.records.createQueryBuilder('audit');
    if (scope.kind === 'user' || scope.userId !== undefined) {
      builder.andWhere('audit.userId = :userId', { userId: scope.userId });
    }
    if (query.result !== undefined) builder.andWhere('audit.result = :result', { result: query.result });
    if (query.from !== undefined) builder.andWhere('audit.createdAt >= :from', { from: query.from });
    if (query.to !== undefined) builder.andWhere('audit.createdAt <= :to', { to: query.to });
    const rows = await builder.orderBy('audit.createdAt', 'DESC').addOrderBy('audit.id', 'ASC')
      .skip((query.page - 1) * query.pageSize).take(query.pageSize + 1).getMany();
    return aiPage(rows, query);
  }
}
