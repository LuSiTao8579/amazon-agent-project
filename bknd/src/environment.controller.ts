import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('环境验证')
@Controller()
export class EnvironmentController {
  @Get('health')
  @ApiOperation({ summary: '检查后端进程，不检查数据库或模型 API' })
  health() {
    return { status: 'ok', service: 'bknd' };
  }
}
