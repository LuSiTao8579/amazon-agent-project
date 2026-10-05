import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { EnvironmentController } from './environment.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
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
            expiresIn: 900,
            issuer: 'amazon-agent-project',
            audience: 'local-development',
          },
          verifyOptions: {
            algorithms: ['HS256'],
            issuer: 'amazon-agent-project',
            audience: 'local-development',
          },
        };
      },
    }),
  ],
  controllers: [AppController, EnvironmentController],
  providers: [AppService, JwtAuthGuard],
})
export class AppModule {}
