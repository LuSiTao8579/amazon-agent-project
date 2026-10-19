import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

const app = await NestFactory.create(AppModule);
const config = app.get(ConfigService);
setupApp(app);
app.enableShutdownHooks();
await app.listen(Number(config.get('PORT') ?? 3001), '127.0.0.1');
