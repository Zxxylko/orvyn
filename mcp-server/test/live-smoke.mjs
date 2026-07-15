import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const serverDirectory = resolve(testDirectory, '..');
loadEnv({ path: resolve(serverDirectory, '.env'), quiet: true });

const token = process.env.ORVYN_API_TOKEN?.trim();
if (!token || token === 'your_sanctum_token_here') {
  throw new Error('Live smoke test requires ORVYN_API_TOKEN in mcp-server/.env or the process environment.');
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(serverDirectory, 'src/server.mjs')],
  env: {
    ...process.env,
    ORVYN_API_TOKEN: token,
  },
  stderr: 'pipe',
});
const client = new Client({ name: 'orvyn-live-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const [me, tasks, integration] = await Promise.all([
    call('orvyn_get_me'),
    call('orvyn_list_tasks', { active: true }),
    call('orvyn_get_integration_status'),
  ]);

  console.log(JSON.stringify({
    connected: true,
    tool_count: tools.tools.length,
    authenticated_user: Boolean(me?.data?.id),
    active_task_count: Array.isArray(tasks?.data) ? tasks.data.length : null,
    ai_provider: integration?.data?.ai?.provider ?? null,
    ai_online: integration?.data?.ai?.online ?? false,
    whatsapp_connected: integration?.data?.service?.connected ?? false,
  }, null, 2));
} finally {
  await client.close();
}

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} returned an MCP error.`);

  return JSON.parse(result.content[0].text);
}
