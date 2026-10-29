import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ListDto } from '../common/list.dto.js';

export class CreateCompanyDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: '公司编码仅允许1–64位字母、数字、下划线和连字符' })
  companyCode: string;

  @ApiProperty({ type: String, maxLength: 200 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  companyName: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  level: number;

  @ApiProperty({ type: String, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/\S/u)
  @MaxLength(100)
  country: string;

  @ApiProperty({ type: String, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/\S/u)
  @MaxLength(100)
  city: string;

  @ApiProperty({ type: Number, description: '成立年份；不是开始供应日期' })
  @IsInt()
  @Min(1)
  @Max(9999)
  foundedYear: number;

  @ApiProperty({ type: Number, minimum: 0, description: '年营收，沿用数据源单位；不是净利润' })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999999)
  annualRevenue: number;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  employees: number;
}

export class UpdateCompanyDto extends PartialType(OmitType(CreateCompanyDto, ['companyCode'] as const), { skipNullProperties: false }) {}

export class CompanyListDto extends ListDto {
  @ApiPropertyOptional({ type: String, example: '1,2', description: '逗号分隔的等级，多选采用 OR' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string'
    ? value.split(',').map((part) => /^\d+$/.test(part) ? Number(part) : NaN) : value)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(100, { each: true })
  levels?: number[];
}
