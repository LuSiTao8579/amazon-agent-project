import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('环境验证')
@Controller()
export class EnvironmentController {
  @Get('health')
  @ApiOperation({ summary: '检查后端进程，不检查数据库或模型 API' })
  health() {
    return { status: 'ok', service: 'bknd' };
  }

  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证 Bearer JWT；本地脚本生成测试 Token' })
  @ApiUnauthorizedResponse({ description: 'Token 缺失、过期或无效' })
  me(@Req() request: Request & { user: { sub: string } }) {
    return { subject: request.user.sub };
  }
}
