// Called only by the isolated browser acceptance launcher.
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { ToolRegistryService } from '../dist/ai/tools/tool-registry.service.js';
import { ModelService } from '../dist/ai-agent/providers/model.service.js';
import { AiCacheService } from '../dist/ai/cache/ai-cache.service.js';
import { DashboardService } from '../dist/dashboard/dashboard.service.js';
import { UserManagementService } from '../dist/users/user-management.service.js';
import { CompaniesService } from '../dist/companies/companies.service.js';

function timed(service, name) {
  const original = service[name];
  const samples = [];
  mock.method(service, name, async function (...args) {
    const start = performance.now();
    try { return await original.apply(this, args); }
    finally { samples.push(performance.now() - start); }
  });
  return samples;
}

function percentiles(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const quantile = p => Number(sorted[Math.ceil(p * sorted.length) - 1].toFixed(2));
  return { p50: quantile(0.5), p95: quantile(0.95) };
}

// The same rows can be rendered twice. Detect the new reply's DOM node, then
// sample the next paint opportunity without adding Playwright polling latency.
async function watchNextPaint(page, selector) {
  await page.getByRole('button', { name: '发送消息' }).evaluate((button, selector) => {
    const latest = () => [...document.querySelectorAll(selector)].at(-1);
    const previous = latest();
    window.chatPaintMs = null;
    button.addEventListener('click', () => {
      const start = performance.now();
      const observer = new MutationObserver(() => {
        const node = latest();
        if (!node || node === previous || !node.getClientRects().length) return;
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => { window.chatPaintMs = performance.now() - start; }));
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true, capture: true });
  }, selector);
}

export async function benchmarkChatCache({ app, pool, actor, send, questions }) {
  await pool.query(`INSERT INTO users(email,password_hash,name,role,status)
    SELECT 'bench' || n || '@example.test','$argon2id$fixture','Lin ' || n,'Analyst','inactive'
    FROM generate_series(1,10000) n`);
  await pool.query(`INSERT INTO companies(company_code,company_name,level,country,city,founded_year,annual_revenue,employees)
    SELECT 'bench' || n, 'Benchmark ' || n, 1 + n % 4, 'UK', 'London', 2016 + n % 7, 100 + n, n % 80
    FROM generate_series(1,20000) n`);
  await pool.query('ANALYZE users');
  await pool.query('ANALYZE companies');
  const model = timed(app.get(ModelService), 'chat');
  const tool = timed(app.get(ToolRegistryService), 'execute');
  const cache = app.get(AiCacheService);
  const requestIds = new Set();
  for (const [name, service, method, selector] of [
    ['query_users', UserManagementService, 'list', 'table[aria-label="用户查询结果"]'],
    ['query_companies', CompaniesService, 'list', 'table[aria-label="公司查询结果"]'],
    ['dashboard_metrics', DashboardService, 'getDashboard', 'table[aria-label="公司等级分布数据"]'],
  ]) {
    const business = timed(app.get(service), method);
    const rows = { cold: [], hot: [] };
    let baseline;
    for (let pair = -2; pair < 24; pair++) {
      for (const path of (pair % 2 === 0 ? ['cold', 'hot'] : ['hot', 'cold'])) {
        if (path === 'cold') await cache.invalidateChatDimension(name);
        const before = [model.length, tool.length, business.length];
        await watchNextPaint(actor.page, selector);
        const { last, request } = await send(actor.page, questions[name]);
        await actor.page.waitForFunction(() => Number.isFinite(window.chatPaintMs));
        const elapsed = await actor.page.evaluate(() => window.chatPaintMs);
        const id = request.postDataJSON().requestId;
        assert.ok(id && !requestIds.has(id));
        requestIds.add(id);
        baseline ??= last.content;
        assert.deepEqual(last.content, baseline);
        const calls = business.length - before[2];
        assert.equal(calls, path === 'cold' ? 1 : 0);
        assert.equal(model.length - before[0], 1);
        assert.equal(tool.length - before[1], 1);
        if (pair >= 0) rows[path].push({ elapsed, tool: tool.at(-1), model: model.at(-1), calls,
          other: elapsed - tool.at(-1) - model.at(-1) });
      }
    }
    for (const [path, samples] of Object.entries(rows)) {
      const summary = { name, path, n: samples.length, businessCalls: samples.reduce((sum, s) => sum + s.calls, 0) };
      for (const metric of ['elapsed', 'tool', 'model', 'other']) summary[metric] = percentiles(samples.map(s => s[metric]));
      console.log('BENCH', JSON.stringify(summary));
    }
  }
}
