import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ValidationPipe, type Type as NestType } from '@nestjs/common';

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
}

/** 显式类型保证生产环境与测试环境得到同一套 DTO 校验。 */
export function dtoPipe(type: NestType<object>) {
  return new ValidationPipe({ expectedType: type, transform: true, whitelist: true,
    forbidNonWhitelisted: true, validationError: { target: false, value: false } });
}

export function searchPattern(search = '') {
  return '%' + search.trim().replace(/[\\%_]/g, '\\$&') + '%';
}
