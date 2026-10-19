import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import type { PublicUser } from '../users/user.types.js';
import { AuthService } from './auth.service.js';
import {
  AuthErrorDto,
  LoginDto,
  LoginResponseDto,
  PublicUserDto,
  SignupDto,
  SignupResponseDto,
} from './auth.dto.js';

// Explicit expectedType keeps validation identical in Nest's build and Vitest's
// transformer, which does not emit TypeScript parameter-type metadata.
const signupPipe = new ValidationPipe({
  expectedType: SignupDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
});
const loginPipe = new ValidationPipe({
  expectedType: LoginDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
});

@ApiTags('账号认证')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('signup')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '注册邮箱账号；注册成功后仍需登录' })
  @ApiBody({ type: SignupDto })
  @ApiCreatedResponse({ type: SignupResponseDto })
  @ApiBadRequestResponse({
    type: AuthErrorDto,
    description: '输入类型、格式、长度或字段不合法',
  })
  @ApiConflictResponse({
    type: AuthErrorDto,
    description: '邮箱已注册（忽略大小写及首尾空白）',
  })
  signup(@Body(signupPipe) input: SignupDto) {
    return this.auth.signup(input);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '校验邮箱密码，返回有效期 15 分钟的 Bearer JWT' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ type: AuthErrorDto })
  @ApiUnauthorizedResponse({
    type: AuthErrorDto,
    description: '邮箱不存在或密码错误均返回相同提示',
  })
  login(@Body(loginPipe) input: LoginDto) {
    return this.auth.login(input);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证 JWT 并读取数据库中的当前用户' })
  @ApiOkResponse({ type: PublicUserDto })
  @ApiUnauthorizedResponse({
    type: AuthErrorDto,
    description: '凭证缺失、无效、过期或用户已不存在',
  })
  me(@Req() request: Request & { user: PublicUser }) {
    return request.user;
  }
}
