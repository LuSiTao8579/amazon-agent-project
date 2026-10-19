import { Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher.service.js';
import { UsersService } from './users.service.js';

/** 用户模块：本步骤只提供服务，不暴露 HTTP 接口；注册/登录接口在下一步的 Auth 模块中实现。 */
@Module({
  providers: [UsersService, PasswordHasher],
  exports: [UsersService, PasswordHasher],
})
export class UsersModule {}
