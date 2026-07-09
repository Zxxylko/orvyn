# ORVYN Backend - Laravel 11

AI-powered student productivity system backend built with Laravel 11, PostgreSQL, Redis, and multi-model AI orchestration.

## Tech Stack

- **Framework**: Laravel 11
- **Database**: PostgreSQL 17 + pgvector
- **Cache/Queue**: Redis
- **Queue Management**: Laravel Horizon
- **WebSockets**: Laravel Reverb
- **Auth**: Laravel Sanctum (Firebase JWT planned)
- **AI Models**: Gemini 2.0 Flash, Claude 3.5 Sonnet

## Features Implemented

✅ **Database Schema**
- Users (UUID primary keys, Firebase auth ready)
- Tasks (with AI processing support)
- Task Embeddings (pgvector for semantic search)
- Time Blocks (calendar/schedule management)
- AI Briefings (daily AI-generated summaries)

✅ **API Endpoints**
- `GET /api/v1/tasks` - List all tasks
- `POST /api/v1/tasks` - Create task
- `POST /api/v1/tasks/smart-parse` - Parse natural language into task
- `GET /api/v1/tasks/{id}` - Get task details
- `PUT /api/v1/tasks/{id}` - Update task
- `DELETE /api/v1/tasks/{id}` - Delete task

✅ **AI Services**
- GeminiService - Task parsing + embeddings
- ClaudeService - Daily briefings + reasoning
- Fallback regex parser (works without API keys)

## Setup

### Prerequisites
- PHP 8.2+
- PostgreSQL 17+ with pgvector extension
- Redis
- Composer

### Installation

1. **Install dependencies**
```bash
composer install
```

2. **Configure environment**
```bash
cp .env.example .env
php artisan key:generate
```

3. **Update .env with your credentials**
```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=orvyn
DB_USERNAME=your_username
DB_PASSWORD=

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# AI API Keys (optional - fallback works without them)
GEMINI_API_KEY=your_gemini_key
CLAUDE_API_KEY=your_claude_key
```

4. **Run migrations**
```bash
php artisan migrate
```

5. **Seed demo data**
```bash
php artisan db:seed --class=DemoSeeder
```

This will create a demo user and output an API token for testing.

### Running the Server

```bash
# Development server
php artisan serve

# Queue worker (for AI jobs)
php artisan horizon

# WebSocket server (for real-time updates)
php artisan reverb:start
```

## Testing the API

```bash
# Get all tasks
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/api/v1/tasks

# Smart parse natural language
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":"OS lab due Friday high priority 3 hours"}' \
  http://localhost:8000/api/v1/tasks/smart-parse
```

## Project Structure

```
app/
├── Http/
│   ├── Controllers/Api/
│   │   ├── TaskController.php       # Task CRUD + smart parse
│   │   ├── TimeBlockController.php  # Calendar management
│   │   └── BriefingController.php   # AI briefings
│   └── Middleware/
│       └── FirebaseAuth.php         # (TODO) Firebase JWT guard
├── Models/
│   ├── User.php
│   ├── Task.php
│   ├── TaskEmbedding.php
│   ├── TimeBlock.php
│   └── AIBriefing.php
├── Services/AI/
│   ├── GeminiService.php            # Gemini API integration
│   └── ClaudeService.php            # Claude API integration
├── Jobs/
│   ├── GenerateEmbeddingJob.php     # (TODO) Background embedding generation
│   └── GenerateBriefingJob.php      # (TODO) Daily briefing generation
└── Policies/
    └── TaskPolicy.php               # Task authorization
```

## Next Steps

### Phase 2: Core Features
- [ ] Implement TimeBlockController
- [ ] Implement BriefingController
- [ ] Create background jobs (GenerateEmbeddingJob, GenerateBriefingJob)
- [ ] Set up Laravel Reverb broadcasting for real-time updates
- [ ] Add Firebase Auth middleware

### Phase 3: AI Enhancement
- [ ] Add Gemini API key and test smart parsing
- [ ] Add Claude API key and test briefing generation
- [ ] Implement semantic search with pgvector
- [ ] Integrate OpenClaw for agent orchestration (post-MVP)

### Phase 4: Production Ready
- [ ] Add comprehensive tests
- [ ] Set up CI/CD
- [ ] Add rate limiting
- [ ] Add API documentation (Scribe/OpenAPI)
- [ ] Performance optimization

## API Keys Setup

### Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add to `.env`: `GEMINI_API_KEY=your_key_here`

### Claude API Key
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create a new API key
3. Add to `.env`: `CLAUDE_API_KEY=your_key_here`

### Firebase (for Auth)
1. Create a Firebase project
2. Download service account JSON
3. Add credentials to `.env`:
```env
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="your_private_key"
FIREBASE_CLIENT_EMAIL=your_client_email
```

## License

Proprietary - ORVYN
