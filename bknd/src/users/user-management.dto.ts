import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { SignupDto } from '../auth/auth.dto.js';
import { ListDto } from '../common/list.dto.js';

export const USER_ROLES = ['Member', 'Manager', 'Analyst'] as const;
export const USER_STATUSES = ['active', 'inactive'] as const;

export class CreateUserDto extends SignupDto {
  @ApiProperty({ type: String, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/\S/u, { message: '姓名不能为空白' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ type: String, enum: USER_ROLES })
  @IsIn(USER_ROLES)
  role: (typeof USER_ROLES)[number];

  @ApiProperty({ type: String, enum: USER_STATUSES })
  @IsIn(USER_STATUSES)
  status: (typeof USER_STATUSES)[number];
}

// null 不是“保持原值”；只允许未出现的字段跳过校验。
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const), { skipNullProperties: false }) {}

export class UserListDto extends ListDto {
  @ApiPropertyOptional({ type: String, example: 'Member,Analyst', description: '逗号分隔的岗位，多选采用 OR；和姓名搜索采用 AND' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.split(',') : value)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn(USER_ROLES, { each: true })
  roles?: string[];
}

export class DeleteUsersDto {
  @ApiProperty({ type: [String], description: '本次明确选中的 UUID，最多100个' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ids: string[];
}
