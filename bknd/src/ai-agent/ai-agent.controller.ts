import { Body, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { dtoPipe } from '../common/list.dto.js';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import type { PublicUser } from '../users/user.types.js';
import { AiAgentService } from './ai-agent.service.js';
import { ChatTurnService } from './chat-turn.service.js';
import { CreateChatTurnDto, ChatTurnResponseDto } from './chat-turn.dto.js';
import { ChatMessageResponseDto, ChatMessagesPageResponseDto, ChatPageDto, ChatSessionResponseDto, ChatSessionsPageResponseDto, CreateChatMessageDto, CreateChatSessionDto } from './ai-agent.dto.js';

type AuthenticatedRequest = Request & { user: PublicUser };

@ApiTags('AI 会话')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '需要有效的登录凭证' })
@UseGuards(JwtAuthGuard)
@Controller('ai-agent/sessions')
export class AiAgentController {
  constructor(@Inject(AiAgentService) private readonly chats: AiAgentService,
    @Inject(ChatTurnService) private readonly turns: ChatTurnService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '创建当前用户的会话' })
  @ApiBody({ type: CreateChatSessionDto })
  @ApiCreatedResponse({ type: ChatSessionResponseDto })
  create(@Req() request: AuthenticatedRequest, @Body(dtoPipe(CreateChatSessionDto)) input: CreateChatSessionDto) {
    return this.chats.createSession(request.user.id, input);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '分页获取当前用户的会话' })
  @ApiOkResponse({ type: ChatSessionsPageResponseDto })
  list(@Req() request: AuthenticatedRequest, @Query(dtoPipe(ChatPageDto)) paging: ChatPageDto) {
    return this.chats.listSessions(request.user.id, paging);
  }

  @Get(':id/messages')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '分页读取当前用户会话的消息（按先后顺序）' })
  @ApiNotFoundResponse({ description: '会话不存在或不属于当前用户' })
  @ApiOkResponse({ type: ChatMessagesPageResponseDto })
  listMessages(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string,
    @Query(dtoPipe(ChatPageDto)) paging: ChatPageDto) {
    return this.chats.listMessages(request.user.id, id, paging);
  }

  @Post(':id/messages')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '保存用户文本；当前步骤不调用模型、不生成AI回复' })
  @ApiBody({ type: CreateChatMessageDto })
  @ApiCreatedResponse({ type: ChatMessageResponseDto })
  @ApiNotFoundResponse({ description: '会话不存在或不属于当前用户' })
  createMessage(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string,
    @Body(dtoPipe(CreateChatMessageDto)) input: CreateChatMessageDto) {
    return this.chats.createMessage(request.user.id, id, input);
  }

  @Post(':id/turns')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '发送一轮对话并返回模型回复；重复请求编号不会重复生成' })
  @ApiBody({ type: CreateChatTurnDto })
  @ApiCreatedResponse({ type: ChatTurnResponseDto })
  @ApiNotFoundResponse({ description: '会话不存在或不属于当前用户' })
  sendTurn(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string,
    @Body(dtoPipe(CreateChatTurnDto)) input: CreateChatTurnDto) {
    return this.turns.send(request.user.id, id, input);
  }
}
