import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const requests = [];
let apiServer;
let client;

before(async () => {
  apiServer = createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body,
    });

    response.setHeader('content-type', 'application/json');
    if (request.headers.authorization !== 'Bearer test-agent-token') {
      response.writeHead(401).end(JSON.stringify({ message: 'Unauthenticated.' }));
      return;
    }

    if (request.method === 'GET' && request.url === '/api/v1/user/me') {
      response.end(JSON.stringify({ data: { id: 'user-1', name: 'Agent Test' } }));
      return;
    }
    if (request.method === 'GET' && request.url === '/api/v1/tasks?active=true') {
      response.end(JSON.stringify({ data: [{ id: 'task-1', title: 'Laporan' }] }));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/v1/tasks/smart-parse') {
      response.statusCode = 201;
      response.end(JSON.stringify({ data: { id: 'task-2', title: body.input } }));
      return;
    }
    if (request.method === 'GET' && request.url === '/api/v1/integrations/whatsapp') {
      response.end(JSON.stringify({ data: { settings: {
        timezone: 'Asia/Jakarta',
        reminder_schedule: {
          daily_briefing_time: '07:00',
          deadline_lead_minutes: [180],
          progress_checkin_time: '14:00',
          burnout_checkin_time: '16:00',
          habit_checkin_time: '18:00',
          weekly_review_day: 7,
          weekly_review_time: '19:00',
        },
        features: { daily_briefing: true, deadline_reminders: true, quick_actions: false },
      } } }));
      return;
    }
    if (request.method === 'PATCH' && request.url === '/api/v1/integrations/whatsapp') {
      response.end(JSON.stringify({ data: body }));
      return;
    }

    response.writeHead(404).end(JSON.stringify({ message: 'Not found.' }));
  });
  apiServer.listen(0, '127.0.0.1');
  await once(apiServer, 'listening');

  const address = apiServer.address();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(testDirectory, '../src/server.mjs')],
    env: {
      ...process.env,
      ORVYN_API_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
      ORVYN_API_TOKEN: 'test-agent-token',
      ORVYN_API_TIMEOUT_MS: '5000',
    },
    stderr: 'pipe',
  });
  client = new Client({ name: 'orvyn-mcp-test', version: '1.0.0' });
  await client.connect(transport);
});

after(async () => {
  await client?.close();
  apiServer?.close();
  if (apiServer) await once(apiServer, 'close');
});

test('publishes the expected Odysseus tools and safety annotations', async () => {
  const response = await client.listTools();
  const tools = new Map(response.tools.map((tool) => [tool.name, tool]));

  assert.equal(tools.size, 14);
  assert.equal(tools.get('orvyn_list_tasks').annotations.readOnlyHint, true);
  assert.equal(tools.get('orvyn_create_smart_task').annotations.readOnlyHint, false);
  assert.equal(tools.get('orvyn_get_integration_status').annotations.readOnlyHint, true);
  assert.equal(tools.get('orvyn_get_analytics_snapshot').annotations.readOnlyHint, true);
  assert.equal(tools.get('orvyn_update_reminder_schedule').annotations.idempotentHint, true);
});

test('forwards authenticated read calls and query parameters to Laravel', async () => {
  const result = await client.callTool({
    name: 'orvyn_list_tasks',
    arguments: { active: true },
  });
  const payload = JSON.parse(result.content[0].text);

  assert.equal(payload.data[0].title, 'Laporan');
  assert.equal(requests.at(-1).authorization, 'Bearer test-agent-token');
  assert.equal(requests.at(-1).url, '/api/v1/tasks?active=true');
});

test('forwards mutating tool payloads without changing their content', async () => {
  const result = await client.callTool({
    name: 'orvyn_create_smart_task',
    arguments: { input: 'Laporan keamanan besok' },
  });
  const payload = JSON.parse(result.content[0].text);

  assert.equal(payload.data.title, 'Laporan keamanan besok');
  assert.deepEqual(requests.at(-1).body, { input: 'Laporan keamanan besok' });
});

test('updates reminder fields while preserving unrelated settings', async () => {
  const result = await client.callTool({
    name: 'orvyn_update_reminder_schedule',
    arguments: {
      daily_briefing_time: '06:30',
      deadline_lead_minutes: [1440, 180, 30],
      weekly_review_enabled: false,
    },
  });
  const payload = JSON.parse(result.content[0].text);

  assert.equal(payload.data.reminder_schedule.daily_briefing_time, '06:30');
  assert.deepEqual(payload.data.reminder_schedule.deadline_lead_minutes, [1440, 180, 30]);
  assert.equal(payload.data.reminder_schedule.habit_checkin_time, '18:00');
  assert.equal(payload.data.features.weekly_review, false);
  assert.equal(payload.data.features.quick_actions, false);
});

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return null;

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
