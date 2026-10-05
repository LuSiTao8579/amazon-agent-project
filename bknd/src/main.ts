import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule);
const config = app.get(ConfigService);
app.enableCors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] });
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
const document = new DocumentBuilder()
  .setTitle('Agent 项目 API')
  .setDescription('本地后端环境验证；JWT 示例不包含正式用户登录系统。')
  .setVersion('0.1.0')
  .addBearerAuth()
  .build();
SwaggerModule.setup('docs', app, () =>
  SwaggerModule.createDocument(app, document),
);
app.enableShutdownHooks();
await app.listen(Number(config.get('PORT') ?? 3001), '127.0.0.1');
