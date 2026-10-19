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
      '邮箱注册、密码登录与真实用户查询；使用 Bearer JWT，有效期 15 分钟。',
    )
    .setVersion('0.3.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, options),
  );
}
