import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import { AdminGuard } from '../admin.guard.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from './auth.constants.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32)
          throw new Error('JWT_SECRET must contain at least 32 characters');
        return {
          secret,
          signOptions: {
            algorithm: 'HS256' as const,
            expiresIn: ACCESS_TOKEN_TTL_SECONDS,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
          },
          verifyOptions: {
            algorithms: ['HS256'],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard],
  exports: [JwtAuthGuard, JwtModule, AdminGuard],
})
export class AuthModule {}
