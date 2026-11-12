import { Body, Controller, Delete, Get, Header, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../jwt-auth.guard.js';
import { AiIdParamsDto } from '../dto/ai-common.dto.js';
import { aiDtoPipe } from '../dto/ai-dto.pipe.js';
import { CreateAiMemoryDto, QueryAiMemoryDto, UpdateAiMemoryDto } from '../dto/ai-memory.dto.js';
import { AiDeletedResponseDto, AiMemoryPageResponseDto, AiMemoryResponseDto } from '../dto/ai-response.dto.js';
import { AiMemoryService } from '../services/ai-memory.service.js';
import { ApiAiAuth, ApiAiId, ApiAiPaging, type AiAuthenticatedRequest } from './ai-api-docs.js';

@ApiTags('AI 用户记忆')
@ApiAiAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/memories')
export class AiMemoryController {
  constructor(@Inject(AiMemoryService) private readonly memories: AiMemoryService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '创建当前用户的记忆' })
  @ApiBody({ type: CreateAiMemoryDto })
  @ApiCreatedResponse({ type: AiMemoryResponseDto })
  create(@Req() request: AiAuthenticatedRequest, @Body(aiDtoPipe(CreateAiMemoryDto)) input: CreateAiMemoryDto) {
    return this.memories.create(request.user.id, input);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '分页查询当前用户的记忆' })
  @ApiAiPaging()
  @ApiOkResponse({ type: AiMemoryPageResponseDto })
  list(@Req() request: AiAuthenticatedRequest, @Query(aiDtoPipe(QueryAiMemoryDto)) query: QueryAiMemoryDto) {
    return this.memories.list(request.user.id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '查询当前用户的记忆' })
  @ApiAiId()
  @ApiOkResponse({ type: AiMemoryResponseDto })
  @ApiNotFoundResponse({ description: '记忆不存在或不属于当前用户' })
  get(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto) {
    return this.memories.get(request.user.id, params.id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '修改当前用户的记忆' })
  @ApiAiId()
  @ApiBody({ type: UpdateAiMemoryDto })
  @ApiOkResponse({ type: AiMemoryResponseDto })
  @ApiNotFoundResponse({ description: '记忆不存在或不属于当前用户' })
  update(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto,
    @Body(aiDtoPipe(UpdateAiMemoryDto)) input: UpdateAiMemoryDto) {
    return this.memories.update(request.user.id, params.id, input);
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '删除当前用户的记忆' })
  @ApiAiId()
  @ApiOkResponse({ type: AiDeletedResponseDto })
  @ApiNotFoundResponse({ description: '记忆不存在或不属于当前用户' })
  remove(@Req() request: AiAuthenticatedRequest, @Param(aiDtoPipe(AiIdParamsDto)) params: AiIdParamsDto) {
    return this.memories.remove(request.user.id, params.id);
  }
}
