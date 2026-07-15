# Odysseus Integration

Odysseus is an optional agent workspace for ORVYN. Ollama remains ORVYN's AI runtime, while Odysseus calls the existing ORVYN MCP tools to read or update student data.

The intended workspace is the self-hosted [Odysseus project](https://github.com/pewdiepie-archdaemon/odysseus). ORVYN only provides the integration boundary and does not install or start Odysseus itself.

## Architecture

```text
WhatsApp -> ORVYN Laravel -> Ollama
Odysseus -> ORVYN MCP server -> ORVYN Laravel
```

ORVYN does not depend on Odysseus at runtime. Reminders, task parsing, and WhatsApp commands continue working when Odysseus is offline.

## Prerequisites

1. Start Ollama and pull the configured models:

   ```bash
   ollama pull qwen3:4b
   ollama pull nomic-embed-text
   ```

2. Start the ORVYN backend:

   ```bash
   cd /Users/zaidan/Coding/orvyn/backend
   php artisan serve --host=127.0.0.1 --port=8000
   ```

3. Create a dedicated Laravel Sanctum token for the ORVYN user:

   ```bash
   cd /Users/zaidan/Coding/orvyn/backend
   php artisan orvyn:issue-agent-token your@email.com --name=odysseus --expires=90
   ```

   Add `--read-only` when the agent should only inspect data. The default token has `orvyn:read` and `orvyn:write`; every authenticated ORVYN endpoint enforces the corresponding ability.

   A local native setup can store the token directly in the ignored MCP environment file without printing it to the terminal:

   ```bash
   php artisan orvyn:issue-agent-token your@email.com \
     --name=odysseus-local --expires=90 --replace \
     --env-file=/Users/zaidan/Coding/orvyn/mcp-server/.env
   ```

4. Install the MCP server dependencies:

   ```bash
   cd /Users/zaidan/Coding/orvyn/mcp-server
   npm install
   ```

## Add ORVYN to Odysseus

Open **Settings -> MCP** in Odysseus as an admin and create a server with these values:

- Name: `ORVYN Student OS`
- Transport: `stdio`
- Command: `node`
- Arguments: `["/Users/zaidan/Coding/orvyn/mcp-server/src/server.mjs"]`
- Environment: use the non-secret values from `mcp-server/odysseus.example.json`. The native server reads its token from the ignored `mcp-server/.env` created by the secure setup command.

On another machine, either run the secure setup command again or pass `ORVYN_API_TOKEN` through Odysseus's protected environment configuration. Never add the real token to the tracked example JSON.

After connecting, Odysseus can list and create tasks, change task status, inspect analytics, generate briefings, manage habits, read campus schedules, inspect Ollama/WhatsApp status, and safely update the advanced reminder schedule without changing the paired phone or consent state.

Verify the MCP server before registering it:

```bash
cd /Users/zaidan/Coding/orvyn/mcp-server
npm run check
npm test
npm run smoke
```

## Docker note

The stdio command runs inside the Odysseus process. The default example therefore targets a native installation on the same machine.

For Docker Desktop:

1. Mount `/Users/zaidan/Coding/orvyn/mcp-server` into the Odysseus container as `/opt/orvyn-mcp`.
2. Ensure Node.js is available inside that container.
3. Use `mcp-server/odysseus.docker.example.json` so Laravel is reached through `host.docker.internal`, not container-local `127.0.0.1`.

Example compose override fragment:

```yaml
services:
  odysseus:
    volumes:
      - /Users/zaidan/Coding/orvyn/mcp-server:/opt/orvyn-mcp:ro
```

Do not expose the MCP process publicly merely to bypass the container boundary.

## Security

- Keep Odysseus authentication enabled.
- Use a dedicated Sanctum token and rotate it if exposed.
- Prefer `--read-only` until an Odysseus workflow genuinely needs mutations.
- Do not commit the real token to `odysseus.example.json` or another tracked file.
- Review mutating tool calls before allowing an Odysseus agent to execute autonomously.
- Keep Ollama bound to localhost unless it is protected by a trusted private network.
