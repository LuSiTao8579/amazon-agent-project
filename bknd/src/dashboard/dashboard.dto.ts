import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsIn, IsInt, Max, Min, ValidateBy, ValidateIf } from 'class-validator';
import { CompanyListDto } from '../companies/company.dto.js';

function parseYear({ value }: TransformFnParams): unknown {
  return typeof value === 'string' && /^\d{1,4}$/.test(value) ? Number(value) : value;
}

export class DashboardFiltersDto extends PickType(CompanyListDto, ['country', 'levels'] as const) {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 9999, description: '公司成立年份下限，含当年' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(parseYear)
  @IsInt()
  @Min(1)
  @Max(9999)
  foundedYearFrom?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 9999, description: '公司成立年份上限，含当年' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(parseYear)
  @IsInt()
  @Min(1)
  @Max(9999)
  @ValidateBy({ name: 'orderedYears', validator: {
    validate(end: unknown, args) {
      const start = (args?.object as DashboardFiltersDto | undefined)?.foundedYearFrom;
      return typeof start !== 'number' || typeof end !== 'number' || start <= end;
    },
    defaultMessage: () => '结束年份不能早于起始年份。',
  } })
  foundedYearTo?: number;
}

export const DASHBOARD_VIEWS = ['report', 'levelDistribution', 'yearlyGrowth'] as const;

export class DashboardToolDto extends DashboardFiltersDto {
  @ApiPropertyOptional({ enum: DASHBOARD_VIEWS, default: 'report' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(DASHBOARD_VIEWS)
  view?: (typeof DASHBOARD_VIEWS)[number];
}
