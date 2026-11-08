import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createChatModel } from './model.factory.js';
import type { ModelMessage } from './chat-model.types.js';

@Injectable()
export class ModelService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  // 延迟读取配置：未启用模型时不影响现有登录、会话和其他业务。
  chat(messages: ModelMessage[]) {
    return createChatModel({ get: key => this.config.get<string>(key) }).chat(messages);
  }
}
