import { Inject, Injectable } from '@nestjs/common';
import type { ToolContext } from '../../jwt-auth.guard.js';
import { UserListDto } from '../../users/user-management.dto.js';
import { UserManagementService } from '../../users/user-management.service.js';
import { BaseTool } from './base-tool.js';

@Injectable()
export class ExampleCountUsersTool extends BaseTool<UserListDto, number> {
  readonly name = 'example_count_users';
  readonly description = '按姓名或岗位统计匹配的用户数';
  readonly intent = 'QUERY_DATA';
  readonly permission = 'users.read';
  readonly inputDto = UserListDto;

  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) {
    super();
  }

  protected async run(_context: ToolContext, args: UserListDto): Promise<number> {
    const { total } = await this.users.list(args);
    return total;
  }
}
