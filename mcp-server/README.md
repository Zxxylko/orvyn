# ORVYN MCP Server

MCP server for ORVYN. It exposes the Laravel API as safe, authenticated MCP tools for agents.

## Setup

```bash
cd /Users/zaidan/Coding/orvyn/mcp-server
npm install
cp .env.example .env
```

Fill `.env`:

```env
ORVYN_API_BASE_URL=http://127.0.0.1:8000/api/v1
ORVYN_API_TOKEN=your_sanctum_token_here
```

Create a dedicated, expiring token from the backend:

```bash
cd /Users/zaidan/Coding/orvyn/backend
php artisan orvyn:issue-agent-token your@email.com --name=odysseus --expires=90
```

Add `--read-only` to issue only the `orvyn:read` ability. Without it, the token receives `orvyn:read` and `orvyn:write`.

For a local installation, the safer setup command writes the ignored MCP environment file without printing the token:

```bash
php artisan orvyn:issue-agent-token your@email.com \
  --name=odysseus-local --expires=90 --replace \
  --env-file=/Users/zaidan/Coding/orvyn/mcp-server/.env
```

## Run

Start ORVYN backend first:

```bash
cd /Users/zaidan/Coding/orvyn/backend
php artisan serve --host=127.0.0.1 --port=8000
```

Then run the MCP server:

```bash
cd /Users/zaidan/Coding/orvyn/mcp-server
ORVYN_API_TOKEN="your_token" npm start
```

## MCP Client Config

Use this shape in clients that support MCP stdio servers:

```json
{
  "mcpServers": {
    "orvyn": {
      "command": "node",
      "args": ["/Users/zaidan/Coding/orvyn/mcp-server/src/server.mjs"],
      "env": {
        "ORVYN_API_BASE_URL": "http://127.0.0.1:8000/api/v1",
        "ORVYN_API_TOKEN": "your_sanctum_token_here",
        "ORVYN_API_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

The same example is available in `mcp.example.json`.

## Odysseus

ORVYN can be added to Odysseus as a stdio MCP server. After generating the ignored local `.env`, copy the field values from `odysseus.example.json` into **Settings -> MCP**. The tracked JSON intentionally contains no token.

For an Odysseus container, mount this directory at `/opt/orvyn-mcp` and use `odysseus.docker.example.json`.

See [`../docs/odysseus.md`](../docs/odysseus.md) for the complete Ollama + Odysseus architecture and security notes.

## Tools

- `orvyn_get_me`
- `orvyn_list_tasks`
- `orvyn_create_smart_task`
- `orvyn_update_task_status`
- `orvyn_get_analytics_snapshot`
- `orvyn_get_today_briefing`
- `orvyn_generate_briefing`
- `orvyn_get_integration_status`
- `orvyn_update_reminder_schedule`
- `orvyn_list_habits`
- `orvyn_create_habit`
- `orvyn_check_in_habit`
- `orvyn_list_campus_schedules`
- `orvyn_create_campus_schedule`

## Verify

```bash
npm run check
npm test
npm run smoke
npm audit --omit=dev
```

The stdio integration tests start a mock ORVYN API and verify tool discovery, bearer authentication, query parameters, and mutating request payloads. The smoke command uses the local `.env` token to verify the real Laravel API without changing student data.
