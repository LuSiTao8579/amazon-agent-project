import { Body, Controller, Delete, Get, Header, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../jwt-auth.guard.js';
import { AI_SESSION_STATUSES } from '../ai.constants.js';
import { AiIdParamsDto } from '../dto/ai-common.dto.js';
import { aiDtoPipe } from '../dto/ai-dto.pipe.js';
import { AiDeletedResponseDto, AiSessionPageResponseDto, AiSessionResponseDto } from '../dto/ai-response.dto.js';
import { CreateAiSessionDto, QueryAiSessionDto, UpdateAiSessionDto } from '../dto/ai-session.dto.js';
import { AiSessionService } from '../services/ai-session.service.js';
import { ApiAiAuth, ApiAiId, ApiAiPaging, type AiAuthenticatedRequest } from './ai-api-docs.js';

@ApiTags('AI 会话基础数据')
@ApiAiAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/sessions')
export class AiSessionController {
  constructor(@Inject(AiSessionService) private readonly sessions: AiSessionService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '创建当前用户的会话及 AI 扩展' })
  @ApiBody({ type: CreateAiSessionDto })
  @ApiCreatedResponse({ type: AiSessionResponseDto })
  create(@Req() request: AiAuthenticatedRequest, @Body(aiDtoPipe(CreateAiSessionDto)) input: CreateAiSessionDto) {
    return this.sessions.create(request.user.id, input);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '分页查询当前用户的会话' })
  @ApiAiPaging()
  @ApiQuery({ name: 'status', required: false, enum: AI_SESSION_STATUSES })
  @ApiOkResponse({ type: AiSessionPageResponseDto })
  list(@Req() request: AiAuthenticatedRequest, @Query(aiDtoPipe(QueryAiSessionDto)) query: QueryAiSessionDto) {
    return this.sessions.list(request.user.id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '查询当前用户的会话' })
  @ApiAiId()
  @ApiOkResponse({ type: AiSessionResponseDto })
  @ApiNotFoundResponse({ description: '会话不存在或不属于当前用户' })
  get(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto) {
    return this.sessions.get(request.user.id, params.id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '更新当前用户会话的 AI 状态', description: '仅变更 AI 会话状态；旧聊天接口暂不根据该状态阻止发送，缓存尚未接入。' })
  @ApiAiId()
  @ApiBody({ type: UpdateAiSessionDto })
  @ApiOkResponse({ type: AiSessionResponseDto })
  @ApiNotFoundResponse({ description: '会话不存在或不属于当前用户' })
  @ApiConflictResponse({ description: '会话正在生成回复' })
  update(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto,
    @Body(aiDtoPipe(UpdateAiSessionDto)) input: UpdateAiSessionDto) {
    return this.sessions.update(request.user.id, params.id, input);
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '软删除当前用户的会话，保留消息' })
  @ApiAiId()
  @ApiOkResponse({ type: AiDeletedResponseDto })
  @ApiNotFoundResponse({ description: '会话不存在或不属于当前用户' })
  @ApiConflictResponse({ description: '会话正在生成回复' })
  remove(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto) {
    return this.sessions.remove(request.user.id, params.id);
  }
}
