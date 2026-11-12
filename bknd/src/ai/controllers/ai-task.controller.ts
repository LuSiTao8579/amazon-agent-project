import { Body, Controller, Delete, Get, Header, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../jwt-auth.guard.js';
import { AI_TASK_STATUSES } from '../ai.constants.js';
import { AiIdParamsDto } from '../dto/ai-common.dto.js';
import { aiDtoPipe } from '../dto/ai-dto.pipe.js';
import { AiDeletedResponseDto, AiTaskPageResponseDto, AiTaskResponseDto } from '../dto/ai-response.dto.js';
import { CreateAiTaskDto, QueryAiTaskDto, UpdateAiTaskDto } from '../dto/ai-task.dto.js';
import { AiTaskService } from '../services/ai-task.service.js';
import { ApiAiAuth, ApiAiId, ApiAiPaging, type AiAuthenticatedRequest } from './ai-api-docs.js';

@ApiTags('AI 任务记录')
@ApiAiAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/tasks')
export class AiTaskController {
  constructor(@Inject(AiTaskService) private readonly tasks: AiTaskService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '创建当前用户的任务记录', description: '创建记录不会自动执行任务。' })
  @ApiBody({ type: CreateAiTaskDto })
  @ApiCreatedResponse({ type: AiTaskResponseDto })
  create(@Req() request: AiAuthenticatedRequest, @Body(aiDtoPipe(CreateAiTaskDto)) input: CreateAiTaskDto) {
    return this.tasks.create(request.user.id, input);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '分页查询当前用户的任务' })
  @ApiAiPaging()
  @ApiQuery({ name: 'status', required: false, enum: AI_TASK_STATUSES })
  @ApiOkResponse({ type: AiTaskPageResponseDto })
  list(@Req() request: AiAuthenticatedRequest, @Query(aiDtoPipe(QueryAiTaskDto)) query: QueryAiTaskDto) {
    return this.tasks.list(request.user.id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '查询当前用户的任务' })
  @ApiAiId()
  @ApiOkResponse({ type: AiTaskResponseDto })
  @ApiNotFoundResponse({ description: '任务不存在或不属于当前用户' })
  get(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto) {
    return this.tasks.get(request.user.id, params.id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '修改当前用户的任务记录' })
  @ApiAiId()
  @ApiBody({ type: UpdateAiTaskDto })
  @ApiOkResponse({ type: AiTaskResponseDto })
  @ApiNotFoundResponse({ description: '任务不存在或不属于当前用户' })
  update(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto,
    @Body(aiDtoPipe(UpdateAiTaskDto)) input: UpdateAiTaskDto) {
    return this.tasks.update(request.user.id, params.id, input);
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '删除当前用户的任务记录' })
  @ApiAiId()
  @ApiOkResponse({ type: AiDeletedResponseDto })
  @ApiNotFoundResponse({ description: '任务不存在或不属于当前用户' })
  remove(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto) {
    return this.tasks.remove(request.user.id, params.id);
  }
}
