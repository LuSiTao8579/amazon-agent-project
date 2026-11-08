import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiAgentController } from './ai-agent.controller.js';
import { AiAgentService } from './ai-agent.service.js';
import { ChatRepository } from './chat.repository.js';
import { ModelService } from './providers/model.service.js';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AiAgentController],
  providers: [AiAgentService, ChatRepository, ModelService],
})
export class AiAgentModule {}
