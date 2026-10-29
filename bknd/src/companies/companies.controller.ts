import { Body, Controller, Delete, Get, Header, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin.guard.js';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import { dtoPipe } from '../common/list.dto.js';
import { CompaniesService } from './companies.service.js';
import { CompanyListDto, CreateCompanyDto, UpdateCompanyDto } from './company.dto.js';

@ApiTags('公司管理')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: '参数不合法' })
@ApiNotFoundResponse({ description: '公司不存在' })
@ApiConflictResponse({ description: '公司编码重复或仍有关联关系' })
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '查询公司；按名称、多个等级筛选并分页' })
  list(@Query(dtoPipe(CompanyListDto)) query: CompanyListDto) { return this.companies.list(query); }

  @Get(':code')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '读取公司详情及人均年营收；员工为零时指标为 null' })
  get(@Param('code') code: string) { return this.companies.get(code); }

  @Post()
  @UseGuards(AdminGuard)
  @Header('Cache-Control', 'no-store')
  @ApiForbiddenResponse({ description: '需要管理员权限' })
  @ApiOperation({ summary: '新增公司；不自动生成供应链关系' })
  @ApiBody({ type: CreateCompanyDto })
  create(@Body(dtoPipe(CreateCompanyDto)) input: CreateCompanyDto) { return this.companies.create(input); }

  @Patch(':code')
  @UseGuards(AdminGuard)
  @Header('Cache-Control', 'no-store')
  @ApiForbiddenResponse({ description: '需要管理员权限' })
  @ApiOperation({ summary: '编辑公司；编码不可变，避免破坏关系引用' })
  @ApiBody({ type: UpdateCompanyDto })
  update(@Param('code') code: string, @Body(dtoPipe(UpdateCompanyDto)) input: UpdateCompanyDto) { return this.companies.update(code, input); }

  @Delete(':code')
  @UseGuards(AdminGuard)
  @Header('Cache-Control', 'no-store')
  @ApiForbiddenResponse({ description: '需要管理员权限' })
  @ApiOperation({ summary: '删除无关联公司的记录；有关联时409，不级联删除' })
  remove(@Param('code') code: string) { return this.companies.remove(code); }
}
