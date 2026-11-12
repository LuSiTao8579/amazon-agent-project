/** 数据库中的会话；userId用于限制只能访问自己的会话。不是ORM实体。 */
export class ChatSessionEntity {
  id!: string;
  userId!: string;
  title!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
