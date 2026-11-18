import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BadRequestException, ValidationPipe, type Type as NestType } from '@nestjs/common';

export class ListDto {
  @ApiPropertyOptional({ type: String, description: '按名称查找，按字面匹配而非 SQL 通配符' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 10, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

/** 显式类型保证生产环境与测试环境得到同一套 DTO 校验。 */
export function dtoPipe(type: NestType<object>) {
  return new ValidationPipe({ expectedType: type, transform: true, whitelist: true,
    forbidNonWhitelisted: true, validationError: { target: false, value: false } });
}

export function searchPattern(search = '') {
  return '%' + search.trim().replace(/[\\%_]/g, '\\$&') + '%';
}

/** ORDER BY 只取业务白名单中的列名，方向来自固定字面值，主键打破同值排序。 */
export function listOrderBy(
  query: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  columns: Readonly<Record<string, string>>,
  defaultKey: string,
  defaultOrder: 'asc' | 'desc',
  primaryColumn: string,
): string {
  const key = query.sortBy === undefined ? defaultKey : query.sortBy;
  if (typeof key !== 'string' || !Object.hasOwn(columns, key)) throw new BadRequestException('不支持的排序字段');
  const order = query.sortOrder === undefined ? (query.sortBy === undefined ? defaultOrder : 'asc') : query.sortOrder;
  if (order !== 'asc' && order !== 'desc') throw new BadRequestException('不支持的排序方向');
  const column = columns[key];
  const tieBreak = column === primaryColumn ? '' : `, ${primaryColumn} ASC`;
  return `${column} ${order === 'asc' ? 'ASC' : 'DESC'}${tieBreak}`;
}
