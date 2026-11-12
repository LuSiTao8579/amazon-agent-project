import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ai_user_memory')
export class AiUserMemoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('text')
  content!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt!: Date;
}
