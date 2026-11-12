import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

// 不把空字符串、小数、科学计数法或重复 query 参数悄悄转换为数字。
function pageNumber(value: unknown): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

export class AiPaginationDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1, maximum: 1000000 })
  @Transform(({ value }: { value: unknown }) => pageNumber(value))
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  @Max(1000000, { message: 'page 最大为 1000000' })
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 10, minimum: 1, maximum: 100 })
  @Transform(({ value }: { value: unknown }) => pageNumber(value))
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(100, { message: 'pageSize 最大为 100' })
  pageSize = 10;
}

/** 仅验证格式；权限和资源归属仍由后续 Service 检查。 */
export class AiIdParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID(undefined, { message: 'id 必须是有效的 UUID' })
  id!: string;
}
