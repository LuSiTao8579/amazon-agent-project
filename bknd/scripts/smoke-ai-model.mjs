import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { ModelService } from '../dist/ai-agent/providers/model.service.js';

// 极短的合成问题，调用用户配置的厂商API；不会读取或发送业务数据。
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const result = await app.get(ModelService).chat([{role:'user',content:'请用一句中文回复：测试成功。'}]);
  console.log('模型请求成功，厂商：', result.provider, '；返回非空文本：', Boolean(result.text.trim()));
} catch (error) {
  console.error('模型调用失败：', error?.kind ?? 'unknown', error?.message ?? '未知错误');
  process.exitCode = 1;
} finally { await app.close(); }
