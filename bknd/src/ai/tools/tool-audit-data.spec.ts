import { describe, expect, it } from 'vitest';
import { redactToolArgs, summarizeToolResult } from './tool-audit-data.js';

describe('工具审计脱敏', () => {
  it('嵌套数组、自由文本、金额别名及动态字段名均不泄露，原对象可供业务继续使用', () => {
    const args = { roles: ['Member'], page: 2, sortBy: 'annualRevenue', filters: [
      { contact: { page: 123 }, annual_revenue: '1234.56', search: '发给 test@example.test',
        'test@example.test': '+44 7700 900123', misc: [1234.56], 手机号: '12345678' },
    ] };
    const original = structuredClone(args);
    const audit = redactToolArgs(args);
    expect(audit).toMatchObject({ page: 2, roles: ['Member'], sortBy: 'annualRevenue',
      filters: [{ contact: '[REDACTED]', annual_revenue: '[REDACTED]', search: '[REDACTED]', field_4: '[REDACTED]' }] });
    expect(JSON.stringify(audit)).not.toMatch(/example\.test|1234|7700/);
    expect(args).toEqual(original);
  });

  it('未知字段只留位置，嵌套在敏感字段内的白名单值也被遮盖', () => {
    const args = { filters: [{ PrivateMarker: { page: 818 }, 自定义机密: true,
      field_0: 'alias', password: { page: 919 }, token: 'token-marker', search: { status: 'active' } }] };
    expect(redactToolArgs(args)).toEqual({ filters: [{ field_0: '[REDACTED]', field_1: '[REDACTED]',
      field_2: '[REDACTED]', password: '[REDACTED]', token: '[REDACTED]', search: '[REDACTED]' }] });
  });

  it('文本和报表结果仅保留诊断字段，循环和超大输入有界', () => {
    expect(summarizeToolResult({ code: 'OK', resultType: 'text', message: 'ok', data: { text: 'secret' } }))
      .toEqual({ code: 'OK', resultType: 'text' });
    const cyclic: Record<string, unknown> = {};
    cyclic.filters = cyclic;
    expect(JSON.stringify(redactToolArgs(cyclic))).toContain('[TRUNCATED]');
    expect((redactToolArgs(Array(1000).fill('secret')) as unknown[]).length).toBeLessThan(205);
  });
});
