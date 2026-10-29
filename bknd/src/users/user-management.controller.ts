import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import { AdminGuard } from '../admin.guard.js';
import { dtoPipe } from '../common/list.dto.js';
import { CreateUserDto, DeleteUsersDto, UpdateUserDto, UserListDto } from './user-management.dto.js';
import { UserManagementService } from './user-management.service.js';

@ApiTags('用户管理')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: '非管理员，或尝试修改/删除受保护管理员' })
@ApiBadRequestResponse({ description: '参数不合法' })
@ApiNotFoundResponse({ description: '用户不存在' })
@ApiConflictResponse({ description: '邮箱重复' })
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('users')
export class UserManagementController {
  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '按姓名、多个岗位搜索用户，服务端分页' })
  list(@Query(dtoPipe(UserListDto)) query: UserListDto) { return this.users.list(query); }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '读取公开用户详情，不含密码哈希' })
  get(@Param('id', new ParseUUIDPipe()) id: string) { return this.users.get(id); }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '创建可登录账号；密码只用于生成 Argon2id 哈希' })
  @ApiBody({ type: CreateUserDto })
  create(@Body(dtoPipe(CreateUserDto)) input: CreateUserDto) { return this.users.create(input); }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '编辑普通用户；不能改变管理权限或密码' })
  @ApiBody({ type: UpdateUserDto })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body(dtoPipe(UpdateUserDto)) input: UpdateUserDto) {
    return this.users.update(id, input);
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '删除普通用户；管理员账号受保护' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) { return this.users.remove([id]); }

  @Post('bulk-delete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '批量删除明确选中的用户；全成功或全回滚' })
  @ApiBody({ type: DeleteUsersDto })
  bulkRemove(@Body(dtoPipe(DeleteUsersDto)) input: DeleteUsersDto) { return this.users.remove(input.ids); }
}
