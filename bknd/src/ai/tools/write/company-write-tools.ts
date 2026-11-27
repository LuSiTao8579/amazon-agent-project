import { Inject } from '@nestjs/common';
import { CompaniesService } from '../../../companies/companies.service.js';
import { CreateCompanyDto, UpdateCompanyDto } from '../../../companies/company.dto.js';
import type { ToolContext } from '../../../jwt-auth.guard.js';
import { BaseWriteTool, executionClosed, rollbackUnsupported } from './base-write-tool.js';
import { NoWriteBody } from './write-prevalidation.service.js';
import { WriteTool } from './write-tool.decorator.js';

const companyPreviewFields = ['companyName', 'level', 'country', 'city', 'foundedYear', 'employees'] as const;

@WriteTool({ name: 'companyCreateTool', target: 'company', operation: 'create' })
export class CompanyCreateTool extends BaseWriteTool<CreateCompanyDto> {
  readonly inputDto = CreateCompanyDto;
  readonly execute = executionClosed;
  readonly rollback = rollbackUnsupported;
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) { super(); }

  protected validate(_context: ToolContext, input: CreateCompanyDto) {
    return this.companies.validateCreate(input);
  }

  protected getPreview() { return companyPreviewFields; }
}

@WriteTool({ name: 'companyUpdateTool', target: 'company', operation: 'update' })
export class CompanyUpdateTool extends BaseWriteTool<UpdateCompanyDto> {
  readonly inputDto = UpdateCompanyDto;
  readonly targetParam = 'companyCode';
  readonly execute = executionClosed;
  readonly rollback = rollbackUnsupported;
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) { super(); }

  protected async validate(_context: ToolContext, input: UpdateCompanyDto, target: string) {
    await this.companies.validateUpdate(target, input);
  }

  protected getPreview(_context: ToolContext, input: UpdateCompanyDto) {
    return companyPreviewFields.filter(field => input[field] !== undefined);
  }
}

@WriteTool({ name: 'companyDeleteTool', target: 'company', operation: 'delete' })
export class CompanyDeleteTool extends BaseWriteTool<NoWriteBody> {
  readonly inputDto = NoWriteBody;
  readonly targetParam = 'companyCode';
  readonly execute = executionClosed;
  readonly rollback = rollbackUnsupported;
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) { super(); }

  protected validate(_context: ToolContext, _body: NoWriteBody, target: string) {
    return this.companies.validateRemove(target);
  }

  protected getPreview() { return [] as const; }
}
