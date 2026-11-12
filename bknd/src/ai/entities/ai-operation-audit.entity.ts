import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import type { AiAuditResult } from '../ai.constants.js';
export type { AiAuditResult } from '../ai.constants.js';

/** 审计只追加；禁止更改由后续迁移和服务权限共同保证。 */
@Entity('ai_operation_audit')
export class AiOperationAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('text')
  action!: string;

  @Column('text', { name: 'resource_type' })
  resourceType!: string;

  @Column('uuid', { name: 'resource_id', nullable: true })
  resourceId!: string | null;

  @Column('text')
  result!: AiAuditResult;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
