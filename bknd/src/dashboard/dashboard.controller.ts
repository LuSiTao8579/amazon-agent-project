import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import { dtoPipe } from '../common/list.dto.js';
import { DashboardFiltersDto } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '按成立年份、国家及等级计算卡片、等级占比和累计趋势' })
  getDashboard(@Query(dtoPipe(DashboardFiltersDto)) filters: DashboardFiltersDto) {
    return this.dashboard.getDashboard(filters);
  }
}
