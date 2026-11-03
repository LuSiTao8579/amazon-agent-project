import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '根据全部公司计算卡片、等级分布和成立年份累计' })
  getDashboard() { return this.dashboard.getDashboard(); }
}
