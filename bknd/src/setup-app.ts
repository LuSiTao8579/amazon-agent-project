import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Shared by production startup and HTTP integration tests. */
export function setupApp(app: INestApplication) {
  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  const options = new DocumentBuilder()
    .setTitle('供应链工作台 API')
    .setDescription(
      '邮箱注册（POST /auth/signup）、密码登录（POST /auth/login）与当前用户查询（GET /auth/me）。后端签发有效期 15 分钟的 Bearer JWT；Next.js 前端通过服务端 HttpOnly Cookie 转发该凭证。所有接口均不返回明文密码或密码哈希。',
    )
    .setVersion('0.6.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, options),
  );
}
