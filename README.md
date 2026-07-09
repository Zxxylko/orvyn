# ORVYN - AI-Powered Student Operating System

> Transform chaos into clarity with AI-powered task management, smart scheduling, and burnout prevention.

![Status](https://img.shields.io/badge/Status-Phase%202%20Complete-success)
![Backend](https://img.shields.io/badge/Backend-Laravel%2011-red)
![Frontend](https://img.shields.io/badge/Frontend-React%2019-blue)
![AI](https://img.shields.io/badge/AI-Gemini%20%2B%20Claude-purple)

---

## 🚀 Quick Start

### Prerequisites
- PHP 8.2+
- PostgreSQL 17+ with pgvector
- Redis
- Node.js 18+
- Composer

### 1. Start Backend

```bash
cd backend

# Install dependencies (if not done)
composer install

# Start Laravel server
php artisan serve

# In another terminal: Start queue worker (optional)
php artisan horizon

# In another terminal: Start WebSocket server (optional)
php artisan reverb:start
```

Backend will be available at: **http://localhost:8000**

### 2. Get API Token

```bash
cd backend
php artisan db:seed --class=DemoSeeder
```

Copy the API token from the output (looks like: `1|L53LlkB1Fe6MgnuTQ1MKH...`)

### 3. Start Frontend

```bash
cd frontend

# Install dependencies (if not done)
npm install

# Start dev server
npm run dev
```

Frontend will be available at: **http://localhost:5173**

### 4. Login

1. Open http://localhost:5173
2. Paste your API token
3. Click "Continue"
4. Start adding tasks! 🎉

---

## ✨ Features

### ✅ Implemented (Phase 1-2)

**Smart Task Input**
- Natural language processing: "OS lab due Friday high priority 3 hours"
- AI automatically extracts: title, deadline, priority, duration, category
- Fallback parser works without API keys

**Task Management**
- Create, read, update, delete tasks
- Toggle completion status
- Priority levels: low, medium, high, critical
- Categories: academics, personal, health, social, work
- Tags and metadata
- Overdue detection

**Real-time Dashboard**
- Beautiful glassmorphism UI
- Task matrix with active/completed sections
- Progress statistics
- Responsive design

**Backend API**
- RESTful API with Laravel 11
- PostgreSQL with pgvector for semantic search
- Redis for caching and queues
- Sanctum authentication
- Comprehensive error handling

### 🚧 Coming Soon (Phase 3-4)

- **AI Briefings** - Daily summaries with Claude
- **Calendar View** - Time block visualization
- **Burnout Gauge** - Workload health metrics
- **Focus Timer** - Pomodoro integration
- **Semantic Search** - Find similar tasks
- **Schedule Optimizer** - AI-powered time allocation
- **Firebase Auth** - Social login
- **Mobile PWA** - Progressive web app

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Smart Input  │  │ Task Matrix  │  │  Router   │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│         │                  │                │        │
│         └──────────────────┴────────────────┘        │
│                      │                               │
│                 Axios Client                         │
└──────────────────────┼──────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────┼──────────────────────────────┐
│              Laravel 11 Backend                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Controllers  │  │  AI Services │  │  Models   │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│         │                  │                │        │
│         └──────────────────┴────────────────┘        │
│                      │                               │
└──────────────────────┼──────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   PostgreSQL      Redis         AI APIs
   + pgvector    (Cache/Queue)  (Gemini/Claude)
```

---

## 📁 Project Structure

```
orvyn/
├── backend/                    # Laravel 11 API
│   ├── app/
│   │   ├── Http/Controllers/Api/
│   │   │   ├── TaskController.php       # Task CRUD + smart parse
│   │   │   ├── TimeBlockController.php  # (TODO) Calendar
│   │   │   └── BriefingController.php   # (TODO) AI briefings
│   │   ├── Models/
│   │   │   ├── User.php
│   │   │   ├── Task.php
│   │   │   ├── TaskEmbedding.php
│   │   │   ├── TimeBlock.php
│   │   │   └── AIBriefing.php
│   │   ├── Services/AI/
│   │   │   ├── GeminiService.php        # Task parsing + embeddings
│   │   │   └── ClaudeService.php        # Briefings + reasoning
│   │   └── Policies/
│   │       └── TaskPolicy.php
│   ├── database/migrations/
│   ├── routes/api.php
│   └── .env
│
├── frontend/                   # React 19 + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   ├── SmartTaskInput.tsx
│   │   │   │   ├── TaskCard.tsx
│   │   │   │   └── TaskMatrix.tsx
│   │   │   └── ui/              # shadcn/ui components (future)
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── DashboardPage.tsx
│   │   ├── hooks/
│   │   │   └── useTasks.ts
│   │   ├── lib/
│   │   │   ├── api.ts           # Axios client
│   │   │   └── utils.ts         # cn() helper
│   │   ├── types/
│   │   │   ├── task.ts
│   │   │   └── user.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── .env
│
├── _archive/
│   └── backend-express/        # Old Express.js backend
│
├── PROJECT_STATUS.md           # Detailed project status
├── IMPLEMENTATION_SUMMARY.md   # What was built
├── API_KEYS_SETUP.md          # API keys guide
└── README.md                   # This file
```

---

## 🔑 API Keys Setup

### Gemini API (Optional - for AI parsing)

1. Get key: https://makersuite.google.com/app/apikey
2. Add to `backend/.env`:
   ```env
   GEMINI_API_KEY=your_key_here
   ```

### Claude API (Optional - for briefings)

1. Get key: https://console.anthropic.com/
2. Add to `backend/.env`:
   ```env
   CLAUDE_API_KEY=your_key_here
   ```

**Note**: System works without API keys using fallback parsers!

See [API_KEYS_SETUP.md](./API_KEYS_SETUP.md) for detailed instructions.

---

## 🧪 Testing

### Backend API

```bash
# Get your token from seeder
export TOKEN="your_token_here"

# List all tasks
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/tasks

# Smart parse natural language
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":"Machine learning project due Monday urgent 5 hours"}' \
  http://localhost:8000/api/v1/tasks/smart-parse

# Update task status
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}' \
  http://localhost:8000/api/v1/tasks/{task_id}
```

### Frontend

1. Open http://localhost:5173
2. Login with your API token
3. Try adding tasks:
   - "Database homework due tomorrow 2 hours"
   - "Gym session today low priority"
   - "Team meeting Friday 3pm high priority 90 minutes"

---

## 🎨 Design System

**Colors**
- Primary: Purple (#8b5cf6)
- Secondary: Pink (#ec4899)
- Accent: Cyan (#06b6d4)
- Background: Dark slate with gradient

**Components**
- Glassmorphism cards with backdrop blur
- Smooth animations with Framer Motion
- Responsive grid layouts
- Custom scrollbars

**Typography**
- Sans: Outfit
- Mono: JetBrains Mono

---

## 📊 Database Schema

```sql
users
├── id (UUID)
├── firebase_uid
├── email
├── name
└── preferences (JSON)

tasks
├── id (UUID)
├── user_id (FK)
├── title, description
├── deadline, status, priority
├── duration_minutes, difficulty
├── category, tags (JSON)
└── ai_processed (boolean)

task_embeddings
├── id (UUID)
├── task_id (FK)
├── embedding (vector(768))  ← pgvector
└── chunk_content

time_blocks
├── id (UUID)
├── user_id (FK)
├── task_id (FK, nullable)
├── start_time, end_time
└── block_type

ai_briefings
├── id (UUID)
├── user_id (FK)
├── briefing_date
├── summary_content
└── health_metrics (JSON)
```

---

## 🛠️ Tech Stack

### Backend
- **Framework**: Laravel 11
- **Database**: PostgreSQL 17 + pgvector
- **Cache/Queue**: Redis
- **Queue Management**: Laravel Horizon
- **WebSockets**: Laravel Reverb
- **Auth**: Laravel Sanctum
- **AI**: Gemini 2.0 Flash, Claude 3.5 Sonnet

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite 8
- **Styling**: TailwindCSS 4
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **Routing**: React Router v6
- **Notifications**: Sonner
- **Date Utils**: date-fns

---

## 📈 Progress

- ✅ **Phase 1**: Backend Foundation (100%)
- ✅ **Phase 2**: Frontend Integration (100%)
- 🚧 **Phase 3**: AI Enhancement (20%)
- ⏸️ **Phase 4**: Production Ready (0%)

**Current Status**: ~50% to MVP

---

## 🐛 Troubleshooting

### Backend Issues

**"Connection refused" error**
```bash
# Make sure PostgreSQL is running
brew services start postgresql@17

# Make sure Redis is running
brew services start redis

# Check Laravel server is running
php artisan serve
```

**"SQLSTATE[08006]" error**
```bash
# Check database credentials in backend/.env
DB_DATABASE=orvyn
DB_USERNAME=your_username
```

### Frontend Issues

**"Network Error" when creating tasks**
```bash
# Make sure backend is running on port 8000
# Check VITE_API_URL in frontend/.env
VITE_API_URL=http://localhost:8000/api/v1
```

**"Unauthorized" error**
```bash
# Get a fresh token
cd backend
php artisan db:seed --class=DemoSeeder
# Copy the new token and login again
```

---

## 🤝 Contributing

This is a personal project, but feedback is welcome!

---

## 📝 License

Proprietary - ORVYN

---

## 🎯 Roadmap

### Immediate (This Week)
- [x] Backend API with smart parsing
- [x] Frontend dashboard with task management
- [x] Real-time task updates
- [ ] Add Gemini API key for real AI parsing
- [ ] Implement time blocks API
- [ ] Add calendar view

### Short-term (Next 2 Weeks)
- [ ] AI briefings with Claude
- [ ] Burnout gauge
- [ ] Focus timer
- [ ] Firebase authentication
- [ ] Semantic search with pgvector

### Long-term (Next Month)
- [ ] Habit tracker
- [ ] Finance tracker
- [ ] OpenClaw agent integration
- [ ] Mobile PWA
- [ ] Production deployment

---

## 📞 Support

For issues or questions:
1. Check [PROJECT_STATUS.md](./PROJECT_STATUS.md)
2. Check [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
3. Check logs:
   - Backend: `backend/storage/logs/laravel.log`
   - Frontend: Browser console

---

**Built with ❤️ for students who want to stay organized without the stress.**
