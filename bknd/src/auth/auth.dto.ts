import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../users/user.types.js';

class EmailDto {
  @ApiProperty({
    type: String,
    format: 'email',
    maxLength: 254,
    example: 'learner@example.test',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsString({ message: '邮箱必须是字符串' })
  @IsEmail({}, { message: '请输入有效的电子邮箱' })
  @MaxLength(254, { message: '邮箱不能超过 254 个字符' })
  email: string;
}

export class SignupDto extends EmailDto {
  @ApiProperty({
    type: String,
    format: 'password',
    minLength: 15,
    maxLength: 128,
    description:
      '15–128 个字符，允许符号和空格，不能全部为空白；不会裁剪或修改密码。',
  })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(15, { message: '注册密码至少需要 15 个字符' })
  @MaxLength(128, { message: '密码不能超过 128 个字符' })
  @Matches(/\S/u, { message: '密码不能全部为空白' })
  password: string;
}

export class LoginDto extends EmailDto {
  @ApiProperty({
    type: String,
    format: 'password',
    minLength: 1,
    maxLength: 128,
    description: '按原样验证已有密码，不对已有账号强加新的注册长度要求。',
  })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(1, { message: '请输入密码' })
  @MaxLength(128, { message: '密码不能超过 128 个字符' })
  password: string;
}

export class PublicUserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'email' })
  email: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class SignupResponseDto {
  @ApiProperty({ type: String, example: '注册成功，请登录' })
  message: string;

  @ApiProperty({ type: PublicUserDto })
  user: PublicUserDto;
}

export class LoginResponseDto {
  @ApiProperty({
    type: String,
    description: '短期 JWT；通过 Authorization: Bearer <accessToken> 发送。',
  })
  accessToken: string;

  @ApiProperty({ type: String, enum: ['Bearer'] })
  tokenType: 'Bearer';

  @ApiProperty({ type: Number, example: 900 })
  expiresIn: number;

  @ApiProperty({ type: PublicUserDto })
  user: PublicUserDto;
}

export class AuthErrorDto {
  @ApiProperty({ type: Number, example: 401 })
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    description: '输入校验失败为消息数组；其他认证错误为字符串。',
  })
  message: string | string[];

  @ApiProperty({ type: String, example: 'Unauthorized' })
  error: string;
}
