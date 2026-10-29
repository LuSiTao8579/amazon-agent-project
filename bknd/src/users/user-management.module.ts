import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from './users.module.js';
import { UserManagementController } from './user-management.controller.js';
import { UserManagementService } from './user-management.service.js';

// 认证模块依赖基础 UsersModule；管理模块单独组装，避免 Auth ↔ Users 循环依赖。
@Module({ imports: [AuthModule, UsersModule], controllers: [UserManagementController], providers: [UserManagementService] })
export class UserManagementModule {}
