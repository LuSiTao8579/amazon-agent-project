import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { isUUID } from 'class-validator';
import type { PublicUser } from './users/user.types.js';
import { UsersService } from './users/users.service.js';

export type ToolContext = Readonly<{ userId: string; isAdmin: boolean; ip: string }>;
export type ToolRequest = Request & { toolContext?: ToolContext };

// 只有完成 JWT 验证和账号检查的请求才能获得可用的上下文对象。
const issuedContexts = new WeakSet<ToolContext>();

export function requireToolContext(context: ToolContext | undefined): asserts context is ToolContext {
  if (!context || !issuedContexts.has(context)) {
    throw new UnauthorizedException('需要已认证请求的工具上下文');
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<ToolRequest & { user?: PublicUser }>();
    const parts = request.headers.authorization?.split(' ');
    if (
      !parts ||
      parts.length !== 2 ||
      parts[0].toLowerCase() !== 'bearer' ||
      !parts[1]
    ) {
      throw new UnauthorizedException('需要 Bearer 登录凭证');
    }
    let subject: string;
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: unknown;
        exp: unknown;
      }>(parts[1]);
      if (
        typeof payload.sub !== 'string' ||
        !isUUID(payload.sub) ||
        typeof payload.exp !== 'number' ||
        !Number.isFinite(payload.exp)
      ) {
        throw new Error('Invalid claims');
      }
      subject = payload.sub;
    } catch {
      throw new UnauthorizedException('登录凭证无效或已过期');
    }

    // Keep DB errors outside the JWT catch: an outage is not an invalid password/token.
    const user = await this.users.findById(subject);
    if (!user || user.status !== 'active') throw new UnauthorizedException('用户不存在或登录状态已失效');
    request.user = user;
    const ip = request.socket.remoteAddress;
    if (ip && isIP(ip)) {
      const toolContext = Object.freeze({ userId: user.id, isAdmin: user.isAdmin, ip });
      issuedContexts.add(toolContext);
      request.toolContext = toolContext;
    }
    return true;
  }
}
