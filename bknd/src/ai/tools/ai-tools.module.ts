import { Module } from '@nestjs/common';
import { UserManagementModule } from '../../users/user-management.module.js';
import { ExampleCountUsersTool } from './example-count-users.tool.js';

@Module({
  imports: [UserManagementModule],
  providers: [ExampleCountUsersTool],
  exports: [ExampleCountUsersTool],
})
export class AiToolsModule {}
