import { Inject } from '@nestjs/common';
import type { ToolContext } from '../../jwt-auth.guard.js';
import { UserListDto } from '../../users/user-management.dto.js';
import { UserManagementService } from '../../users/user-management.service.js';
import { Tool } from './tool.decorator.js';
import { BaseTool } from './base-tool.js';

type CountOutput = { resultType: 'text'; data: { text: string } };

@Tool({ name: 'example_count_users', description: '按姓名或岗位统计匹配的用户数', intent: 'QUERY_DATA',
  permission: 'users.read', defaultEnabled: false })
export class ExampleCountUsersTool extends BaseTool<UserListDto, CountOutput> {
  readonly inputDto = UserListDto;

  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) {
    super();
  }

  protected async run(context: ToolContext, args: UserListDto): Promise<CountOutput> {
    const { total } = await this.users.list(args, context);
    return { resultType: 'text', data: { text: `匹配用户数为 ${total}。` } };
  }
}
