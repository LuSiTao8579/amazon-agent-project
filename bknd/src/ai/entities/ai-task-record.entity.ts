import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AiTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

@Entity('ai_task_record')
export class AiTaskRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('text')
  name!: string;

  @Column('text', { default: 'pending' })
  status!: AiTaskStatus;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt!: Date;
}
