import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({ imports: [AuthModule, UsersModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
