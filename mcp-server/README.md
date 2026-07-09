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

Get a local token from the backend:

```bash
cd /Users/zaidan/Coding/orvyn/backend
php artisan db:seed --class=DemoSeeder
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
        "ORVYN_API_TOKEN": "your_sanctum_token_here"
      }
    }
  }
}
```

The same example is available in `mcp.example.json`.

## Tools

- `orvyn_get_me`
- `orvyn_list_tasks`
- `orvyn_create_smart_task`
- `orvyn_update_task_status`
- `orvyn_get_analytics_snapshot`
- `orvyn_get_today_briefing`
- `orvyn_generate_briefing`
- `orvyn_list_habits`
- `orvyn_create_habit`
- `orvyn_check_in_habit`
- `orvyn_list_campus_schedules`
- `orvyn_create_campus_schedule`
