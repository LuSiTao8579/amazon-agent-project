import { Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher.service.js';
import { UsersService } from './users.service.js';

/** 用户数据访问与密码哈希服务，供 Auth 模块复用；不暴露用户列表接口。 */
@Module({
  providers: [UsersService, PasswordHasher],
  exports: [UsersService, PasswordHasher],
})
export class UsersModule {}
