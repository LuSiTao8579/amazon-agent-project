import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { sub: string } }>();
    const parts = request.headers.authorization?.split(' ');
    if (
      !parts ||
      parts.length !== 2 ||
      parts[0].toLowerCase() !== 'bearer' ||
      !parts[1]
    ) {
      throw new UnauthorizedException('Bearer token required');
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; exp: number }>(
        parts[1],
      );
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.exp !== 'number'
      )
        throw new Error('Invalid claims');
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
