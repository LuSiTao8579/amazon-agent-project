/** 附件元数据：storageKey仅供服务端使用，不能直接作为公开URL。 */
export class ChatAttachmentEntity {
  id!: string;
  messageId!: string;
  originalName!: string;
  mediaType!: string;
  byteSize!: string;
  storageKey!: string;
  createdAt!: Date;
}
