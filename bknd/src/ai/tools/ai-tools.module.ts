import { Module } from '@nestjs/common';
import { AiAuditModule } from '../ai-audit.module.js';
import { TOOL_EXECUTOR } from './tool-executor.js';
import { DiscoveryModule } from '@nestjs/core';
import { CompaniesModule } from '../../companies/companies.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { UserManagementModule } from '../../users/user-management.module.js';
import { UsersModule } from '../../users/users.module.js';
import { AiCacheModule } from '../cache/ai-cache.module.js';
import { QueryUsersTool, QueryCompaniesTool, DashboardMetricsTool } from './business-tools.js';
import { ExampleCountUsersTool } from './example-count-users.tool.js';
import { ToolPolicyService } from './tool-policy.service.js';
import { WritePrevalidationService } from './write/write-prevalidation.service.js';
import { ToolRegistryService } from './tool-registry.service.js';

@Module({
  imports: [AiAuditModule, DiscoveryModule, AiCacheModule, UsersModule, UserManagementModule, CompaniesModule, DashboardModule],
  providers: [{ provide: TOOL_EXECUTOR, useExisting: ToolRegistryService }, ToolPolicyService, WritePrevalidationService, ToolRegistryService, QueryUsersTool, QueryCompaniesTool, DashboardMetricsTool, ExampleCountUsersTool],
  exports: [AiCacheModule, TOOL_EXECUTOR, ToolRegistryService, ToolPolicyService, ExampleCountUsersTool],
})
export class AiToolsModule {}
