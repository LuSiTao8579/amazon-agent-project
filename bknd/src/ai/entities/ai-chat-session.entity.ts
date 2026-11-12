import { Column, Entity, PrimaryColumn } from 'typeorm';

export type AiSessionStatus = 'active' | 'closed';

/** ID 与已有 ai_chat_sessions 会话相同；归属通过原会话查验。 */
@Entity('ai_chat_session')
export class AiChatSessionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('text', { default: 'active' })
  status!: AiSessionStatus;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt!: Date;
}
