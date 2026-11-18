import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import type { AiAuditResult } from '../ai.constants.js';
import type { ToolAuditSummary } from '../tools/tool-audit-data.js';
export type { AiAuditResult } from '../ai.constants.js';

/** 审计只追加；禁止更改由后续迁移和服务权限共同保证。 */
@Entity('ai_operation_audit')
export class AiOperationAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id', nullable: true })
  userId!: string | null;

  @Column('text')
  action!: string;

  @Column('text', { name: 'resource_type' })
  resourceType!: string;

  @Column('uuid', { name: 'resource_id', nullable: true })
  resourceId!: string | null;

  @Column('text')
  result!: AiAuditResult;

  @Column('text', { name: 'tool_name', nullable: true })
  toolName!: string | null;

  @Column('jsonb', { name: 'input_params', nullable: true })
  inputParams!: unknown;

  @Column('jsonb', { name: 'result_summary', nullable: true })
  resultSummary!: ToolAuditSummary | null;

  @Column('inet', { nullable: true })
  ip!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
