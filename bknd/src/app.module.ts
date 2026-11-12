import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EnvironmentController } from './environment.controller.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UserManagementModule } from './users/user-management.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { AiAgentModule } from './ai-agent/ai-agent.module.js';
import { AiModule } from './ai/ai.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.ai', '.env'] }),
    DatabaseModule,
    AuthModule,
    UserManagementModule,
    CompaniesModule,
    DashboardModule,
    AiAgentModule,
    AiModule,
  ],
  controllers: [AppController, EnvironmentController],
  providers: [AppService],
})
export class AppModule {}
