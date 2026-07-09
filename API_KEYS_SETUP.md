# API Keys Setup Guide

This guide will help you set up the required API keys for ORVYN's AI features.

## Overview

ORVYN uses two AI models:
- **Gemini 2.0 Flash** - Fast task parsing and embedding generation
- **Claude 3.5 Sonnet** - Deep reasoning for daily briefings

**Note**: The system works without API keys using fallback parsers, but AI features require keys.

---

## 1. Gemini API Key (Google AI Studio)

### What It's Used For
- Smart task parsing (natural language → structured data)
- Generating 768-dimensional embeddings for semantic search
- Fast, structured JSON output

### How to Get It

1. **Go to Google AI Studio**
   - Visit: https://makersuite.google.com/app/apikey
   - Sign in with your Google account

2. **Create API Key**
   - Click "Create API Key"
   - Select "Create API key in new project" (or use existing project)
   - Copy the generated key

3. **Add to ORVYN**
   ```bash
   cd backend
   nano .env  # or use your preferred editor
   ```
   
   Add this line:
   ```env
   GEMINI_API_KEY=AIzaSy...your_key_here
   ```

4. **Test It**
   ```bash
   # Restart Laravel server
   php artisan serve
   
   # Test smart parse (should now use real AI)
   curl -X POST \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"input":"Machine learning project due next Monday high priority 5 hours"}' \
     http://localhost:8000/api/v1/tasks/smart-parse
   ```
   
   Look for `"ai_processed": true` in the response!

### Pricing
- **Free tier**: 60 requests per minute
- **Cost**: Free for development, very cheap for production
- **Docs**: https://ai.google.dev/pricing

---

## 2. Claude API Key (Anthropic)

### What It's Used For
- Generating daily AI briefings
- Deep reasoning about workload and burnout
- Personalized recommendations

### How to Get It

1. **Go to Anthropic Console**
   - Visit: https://console.anthropic.com/
   - Sign in or create an account

2. **Get API Key**
   - Navigate to "API Keys" section
   - Click "Create Key"
   - Give it a name (e.g., "ORVYN Development")
   - Copy the generated key (starts with `sk-ant-`)

3. **Add to ORVYN**
   ```bash
   cd backend
   nano .env
   ```
   
   Add this line:
   ```env
   CLAUDE_API_KEY=sk-ant-...your_key_here
   ```

4. **Test It**
   ```bash
   # This endpoint will be implemented in Phase 2
   # For now, you can test the service directly:
   php artisan tinker
   
   # In tinker:
   $user = App\Models\User::first();
   $service = new App\Services\AI\ClaudeService();
   $context = [
       'tasks_count' => 10,
       'overdue_count' => 2,
       'completion_rate' => 75,
       'avg_difficulty' => 3.5,
       'upcoming_deadlines' => []
   ];
   $briefing = $service->generateBriefing($user, $context);
   print_r($briefing);
   ```

### Pricing
- **Free tier**: $5 credit on signup
- **Cost**: ~$0.003 per briefing (very cheap)
- **Docs**: https://docs.anthropic.com/claude/reference/getting-started-with-the-api

---

## 3. Firebase (Optional - For Production Auth)

### What It's Used For
- User authentication (sign up, sign in, password reset)
- JWT token verification on backend
- Social auth (Google, GitHub, etc.)

### How to Set It Up

1. **Create Firebase Project**
   - Visit: https://console.firebase.google.com/
   - Click "Add project"
   - Follow the wizard (disable Google Analytics for now)

2. **Enable Authentication**
   - In Firebase Console, go to "Authentication"
   - Click "Get started"
   - Enable "Email/Password" provider

3. **Get Service Account Credentials**
   - Go to Project Settings (gear icon) → Service Accounts
   - Click "Generate new private key"
   - Download the JSON file

4. **Add to ORVYN**
   ```bash
   cd backend
   nano .env
   ```
   
   Add these lines (from the downloaded JSON):
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
   ```

5. **Frontend Setup**
   - Add Firebase config to frontend `.env`:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   ```

### Pricing
- **Free tier**: 10K verifications/month
- **Cost**: Free for MVP, very cheap for production
- **Docs**: https://firebase.google.com/docs/auth

---

## Current .env Template

Here's what your `backend/.env` should look like:

```env
APP_NAME=ORVYN
APP_ENV=local
APP_KEY=base64:...generated_by_laravel...
APP_DEBUG=true
APP_URL=http://localhost:8000

# Database
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=orvyn
DB_USERNAME=zaidan
DB_PASSWORD=

# Redis
CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# AI Configuration
GEMINI_API_KEY=                    # ← Add your Gemini key here
CLAUDE_API_KEY=                    # ← Add your Claude key here

# Firebase Configuration (Optional for MVP)
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# OpenClaw Configuration (Post-MVP)
OPENCLAW_ENABLED=false
OPENCLAW_HOST=http://localhost:3000
```

---

## Testing Checklist

After adding API keys, test each feature:

### ✅ Gemini (Task Parsing)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":"Calculus homework due Wednesday 2pm high priority 90 minutes"}' \
  http://localhost:8000/api/v1/tasks/smart-parse
```

**Expected**: `"ai_processed": true` and accurate parsing of:
- Deadline: Next Wednesday at 2pm
- Priority: high
- Duration: 90 minutes

### ✅ Gemini (Embeddings)
```bash
# This will be tested via background jobs in Phase 2
# For now, test in tinker:
php artisan tinker

$service = new App\Services\AI\GeminiService();
$embedding = $service->generateEmbedding("Complete operating systems lab assignment");
count($embedding);  // Should return 768
```

### ✅ Claude (Briefings)
```bash
# Will be available via API in Phase 2
# For now, test in tinker (see Claude section above)
```

---

## Troubleshooting

### "Invalid API key" Error
- Double-check the key is copied correctly (no extra spaces)
- Make sure you're using the right key for the right service
- Restart Laravel server after adding keys: `php artisan serve`

### "Rate limit exceeded"
- Gemini free tier: 60 requests/minute
- Claude free tier: Based on your credit balance
- Solution: Add delays between requests or upgrade to paid tier

### "Model not found"
- Check `config/ai.php` for correct model names
- Gemini: `gemini-2.0-flash-exp` (may change, check docs)
- Claude: `claude-3-5-sonnet-20241022`

### Embeddings Not Working
- Make sure pgvector extension is enabled: `psql orvyn -c "CREATE EXTENSION IF NOT EXISTS vector;"`
- Check embedding dimension matches (768 for Gemini text-embedding-004)

---

## Security Best Practices

1. **Never commit API keys to Git**
   - `.env` is already in `.gitignore`
   - Use `.env.example` for templates

2. **Use environment variables in production**
   - Laravel Forge: Add via environment variables
   - Laravel Vapor: Add via Vapor UI
   - Docker: Use secrets or env files

3. **Rotate keys regularly**
   - Especially if they're exposed or shared

4. **Monitor usage**
   - Check Google AI Studio dashboard
   - Check Anthropic Console usage
   - Set up billing alerts

---

## Cost Estimates (Production)

Based on 100 active users:

| Service | Usage | Cost/Month |
|---------|-------|------------|
| Gemini (parsing) | ~3,000 requests | $0.15 |
| Gemini (embeddings) | ~3,000 embeddings | $0.03 |
| Claude (briefings) | ~3,000 briefings | $9.00 |
| **Total** | | **~$10/month** |

Very affordable for MVP! 🎉

---

## Next Steps

1. ✅ Get Gemini API key
2. ✅ Get Claude API key
3. ✅ Add both to `.env`
4. ✅ Restart Laravel server
5. ✅ Test smart parse endpoint
6. ⏸️ Wait for Phase 2 to test briefings via API
7. ⏸️ (Optional) Set up Firebase for production auth

---

**Questions?** Check the logs:
```bash
tail -f backend/storage/logs/laravel.log
```

All AI errors are logged with context for debugging.
