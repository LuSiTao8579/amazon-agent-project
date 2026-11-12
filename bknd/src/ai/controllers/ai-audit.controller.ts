import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../admin.guard.js';
import { JwtAuthGuard } from '../../jwt-auth.guard.js';
import { AI_AUDIT_CLIENT_PREFIX, AI_AUDIT_RESULTS } from '../ai.constants.js';
import { AdminQueryAiAuditDto, CreateAiAuditReportDto, QueryAiAuditDto } from '../dto/ai-audit.dto.js';
import { AiIdParamsDto } from '../dto/ai-common.dto.js';
import { aiDtoPipe } from '../dto/ai-dto.pipe.js';
import { AiAuditPageResponseDto, AiAuditResponseDto } from '../dto/ai-response.dto.js';
import { AiAuditService } from '../services/ai-audit.service.js';
import { ApiAiAuth, ApiAiId, ApiAiPaging, type AiAuthenticatedRequest } from './ai-api-docs.js';

function ApiAiAuditFilters() {
  return applyDecorators(
    ApiAiPaging(),
    ApiQuery({ name: 'result', required: false, enum: AI_AUDIT_RESULTS }),
    ApiQuery({ name: 'from', required: false, type: String, format: 'date-time', description: '含时区的开始时间，包含边界' }),
    ApiQuery({ name: 'to', required: false, type: String, format: 'date-time', description: '含时区的结束时间，包含边界' }),
  );
}

@ApiTags('AI 审计记录')
@ApiAiAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/audits')
export class AiAuditController {
  constructor(@Inject(AiAuditService) private readonly audits: AiAuditService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '上报当前用户的审计记录', description: '客户端提供的动作和结果未经服务端核实；服务端为 action 添加 client. 前缀，操作者来自 JWT。' })
  @ApiBody({ type: CreateAiAuditReportDto })
  @ApiCreatedResponse({ type: AiAuditResponseDto })
  create(@Req() request: AiAuthenticatedRequest, @Body(aiDtoPipe(CreateAiAuditReportDto)) input: CreateAiAuditReportDto) {
    return this.audits.create(request.user.id, {
      action: `${AI_AUDIT_CLIENT_PREFIX}${input.action}`, resourceType: input.resourceType,
      resourceId: input.resourceId, result: input.result,
    });
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '分页查询当前用户的审计记录' })
  @ApiAiAuditFilters()
  @ApiOkResponse({ type: AiAuditPageResponseDto })
  list(@Req() request: AiAuthenticatedRequest, @Query(aiDtoPipe(QueryAiAuditDto)) query: QueryAiAuditDto) {
    return this.audits.listMine(request.user.id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '查询当前用户的审计记录' })
  @ApiAiId()
  @ApiOkResponse({ type: AiAuditResponseDto })
  @ApiNotFoundResponse({ description: '审计记录不存在或不属于当前用户' })
  get(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto) {
    return this.audits.getMine(request.user.id, params.id);
  }
}

@ApiTags('AI 管理员审计')
@ApiAiAuth()
@ApiForbiddenResponse({ description: '需要管理员权限' })
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('ai/admin/audits')
export class AiAdminAuditController {
  constructor(@Inject(AiAuditService) private readonly audits: AiAuditService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '管理员分页查询全部审计记录' })
  @ApiAiAuditFilters()
  @ApiQuery({ name: 'userId', required: false, type: String, format: 'uuid', description: '按用户筛选' })
  @ApiOkResponse({ type: AiAuditPageResponseDto })
  list(@Req() request: AiAuthenticatedRequest, @Query(aiDtoPipe(AdminQueryAiAuditDto)) query: AdminQueryAiAuditDto) {
    return this.audits.listAll(request.user.id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '管理员按 ID 查询审计记录' })
  @ApiAiId()
  @ApiOkResponse({ type: AiAuditResponseDto })
  @ApiNotFoundResponse({ description: '审计记录不存在' })
  get(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto) {
    return this.audits.getAsAdmin(request.user.id, params.id);
  }
}
