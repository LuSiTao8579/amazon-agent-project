import { Inject } from '@nestjs/common';
import type { ToolContext } from '../../../jwt-auth.guard.js';
import { CreateUserDto, DeleteUsersDto, UpdateUserDto } from '../../../users/user-management.dto.js';
import { UserManagementService } from '../../../users/user-management.service.js';
import { BaseWriteTool, executionClosed, rollbackUnsupported } from './base-write-tool.js';
import { NoWriteBody } from './write-prevalidation.service.js';
import { WriteTool } from './write-tool.decorator.js';

const userPreviewFields = ['name', 'role', 'status'] as const;

@WriteTool({ name: 'userCreateTool', target: 'user', operation: 'create' })
export class UserCreateTool extends BaseWriteTool<CreateUserDto> {
  readonly inputDto = CreateUserDto;
  readonly execute = executionClosed;
  readonly rollback = rollbackUnsupported;
  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) { super(); }

  protected validate(_context: ToolContext, input: CreateUserDto) {
    return this.users.validateCreate(input);
  }

  protected getPreview() { return userPreviewFields; }
}

@WriteTool({ name: 'userUpdateTool', target: 'user', operation: 'update' })
export class UserUpdateTool extends BaseWriteTool<UpdateUserDto> {
  readonly inputDto = UpdateUserDto;
  readonly targetParam = 'userId';
  readonly execute = executionClosed;
  readonly rollback = rollbackUnsupported;
  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) { super(); }

  protected async validate(_context: ToolContext, input: UpdateUserDto, target: string) {
    await this.users.validateUpdate(target, input);
  }

  protected getPreview(_context: ToolContext, input: UpdateUserDto) {
    return userPreviewFields.filter(field => input[field] !== undefined);
  }
}

@WriteTool({ name: 'userDeleteTool', target: 'user', operation: 'delete' })
export class UserDeleteTool extends BaseWriteTool<NoWriteBody> {
  readonly inputDto = NoWriteBody;
  readonly targetParam = 'userId';
  readonly execute = executionClosed;
  readonly rollback = rollbackUnsupported;
  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) { super(); }

  protected validate(_context: ToolContext, _body: NoWriteBody, target: string) {
    return this.users.validateRemove([target]);
  }

  protected getPreview() { return [] as const; }
}

@WriteTool({ name: 'userBatchDeleteTool', target: 'user', operation: 'batchDelete' })
export class UserBatchDeleteTool extends BaseWriteTool<DeleteUsersDto> {
  readonly inputDto = DeleteUsersDto;
  readonly execute = executionClosed;
  readonly rollback = rollbackUnsupported;
  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) { super(); }

  protected validate(_context: ToolContext, input: DeleteUsersDto) {
    return this.users.validateRemove(input.ids);
  }

  protected getPreview() { return [] as const; }
}
