import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { AI_DATA_SOURCE, AI_ENTITIES } from '../src/ai/ai.module.js';

describe('AI TypeORM connection', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken(AI_DATA_SOURCE));
  });

  afterAll(async () => {
    if (app && dataSource?.isInitialized) await app.close();
  });

  it('connects without synchronizing schemas or running migrations and loads only AI entities', async () => {
    expect(dataSource.isInitialized).toBe(true);
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrationsRun).toBe(false);
    expect(dataSource.entityMetadatas.map((item) => item.tableName).sort()).toEqual([
      'ai_chat_session', 'ai_operation_audit', 'ai_task_record', 'ai_user_memory',
    ]);
    expect(AI_ENTITIES.every((entity) => dataSource.hasMetadata(entity))).toBe(true);
    const rows = await dataSource.query('SELECT 1 AS value') as Array<{ value: number }>;
    expect(rows[0].value).toBe(1);
  });

  it('closes the AI connection with the application', async () => {
    await app.close();
    expect(dataSource.isInitialized).toBe(false);
  });
});
