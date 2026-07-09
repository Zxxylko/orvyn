# Gemini API Setup Guide

## Step 1: Get Your API Key

1. **Open Google AI Studio**: https://makersuite.google.com/app/apikey
2. **Sign in** with your Google account
3. **Click "Create API Key"**
4. **Select** "Create API key in new project" (or use existing project)
5. **Copy** the generated key (format: `AIzaSy...`)

## Step 2: Add to Backend

Open `backend/.env` and add your key:

```env
GEMINI_API_KEY=AIzaSyYourActualKeyHere
```

**Important**: No quotes needed, just paste the key directly.

## Step 3: Test the Integration

Run the test script:

```bash
cd backend
php test-gemini.php
```

### Expected Output (Success)

```
🧪 Testing Gemini API Integration
================================

Test 1: Smart Task Parsing
---------------------------
Input: "Machine learning project due next Monday high priority 5 hours"

✅ SUCCESS! Gemini API is working!

Parsed Result:
  Title: Machine learning project
  Deadline: 2026-06-01T23:59:59.000000Z
  Priority: high
  Duration: 300 minutes
  Difficulty: 4/5
  Category: academics
  AI Processed: Yes

Test 2: Embedding Generation
----------------------------
Text: "Complete operating systems lab assignment on process scheduling"

✅ SUCCESS! Embedding generated!
  Dimensions: 768
  First 5 values: [0.0234, -0.0156, 0.0789, -0.0234, 0.0456...]

================================
Testing complete!
```

### Expected Output (Fallback - No API Key)

```
Test 1: Smart Task Parsing
---------------------------
⚠️  Using fallback parser (API key not set or invalid)

Parsed Result:
  Title: Machine learning project due next Monday high priority 5 hours
  Priority: high
  Duration: 300 minutes
  AI Processed: No (fallback)
```

## Step 4: Test in Frontend

1. **Restart Laravel server** (to load new .env):
   ```bash
   # Stop current server (Ctrl+C)
   php artisan serve
   ```

2. **Open frontend**: http://localhost:5173

3. **Try adding a task**:
   ```
   "Calculus homework due Wednesday 2pm high priority 90 minutes"
   ```

4. **Check the response** - Look for `"ai_processed": true` in the task data

## What Gemini Does

### Task Parsing (Gemini 2.0 Flash)
- Extracts title from natural language
- Infers deadline from relative dates ("tomorrow", "Friday", "next week")
- Detects priority from keywords ("urgent", "important", "asap")
- Estimates duration from time mentions ("2 hours", "90 minutes")
- Assigns difficulty (1-5 scale) based on context
- Categorizes task (academics, personal, health, etc.)
- Extracts relevant tags

### Embedding Generation (text-embedding-004)
- Converts task text to 768-dimensional vector
- Used for semantic search (coming in Phase 3)
- Enables "find similar tasks" feature

## Pricing

**Free Tier:**
- 60 requests per minute
- 1,500 requests per day
- Perfect for development and MVP!

**Cost (if you exceed free tier):**
- Task parsing: ~$0.00005 per request
- Embeddings: ~$0.00001 per request
- **Very cheap!** Even 10,000 tasks/month = ~$0.60

## Troubleshooting

### "Invalid API key" Error

**Check:**
1. Key is copied correctly (no extra spaces)
2. Key starts with `AIzaSy`
3. No quotes around the key in .env
4. Laravel server was restarted after adding key

**Fix:**
```bash
# Clear config cache
php artisan config:clear

# Restart server
php artisan serve
```

### "Rate limit exceeded"

**Cause:** More than 60 requests per minute

**Fix:**
- Wait 1 minute
- For production, implement rate limiting in your app
- Or upgrade to paid tier (very cheap)

### "Model not found"

**Cause:** Model name changed

**Fix:**
Check `config/ai.php` and update model names:
```php
'models' => [
    'flash' => 'gemini-2.0-flash-exp',  // Check latest name
    'embedding' => 'text-embedding-004',
],
```

Latest models: https://ai.google.dev/models

## Comparison: AI vs Fallback

### With Gemini API ✅
```
Input: "OS lab due Friday urgent 3h"

Output:
  Title: "OS lab"
  Deadline: "2026-05-29T23:59:59Z" (next Friday)
  Priority: "critical" (detected "urgent")
  Duration: 180 minutes (parsed "3h")
  Difficulty: 4 (inferred from "lab")
  Category: "academics"
  Tags: ["operating-systems", "lab"]
  AI Processed: true
```

### Without API Key (Fallback) ⚠️
```
Input: "OS lab due Friday urgent 3h"

Output:
  Title: "OS lab due Friday urgent 3h" (full input)
  Deadline: "2026-05-29T23:59:59Z" (regex detected "Friday")
  Priority: "critical" (regex detected "urgent")
  Duration: 180 minutes (regex detected "3h")
  Difficulty: 3 (default)
  Category: "academics" (default)
  Tags: []
  AI Processed: false
```

**Key Difference:** AI extracts clean title and better context understanding!

## Next Steps After Setup

Once Gemini is working:

1. ✅ **Test smart parsing** - Try complex natural language
2. ✅ **Generate embeddings** - Run background job
3. ✅ **Implement semantic search** - Find similar tasks
4. ⏸️ **Add Claude API** - For daily briefings
5. ⏸️ **Optimize prompts** - Fine-tune parsing accuracy

## Security Best Practices

1. **Never commit API key to Git**
   - `.env` is already in `.gitignore` ✅
   
2. **Use environment variables in production**
   - Laravel Forge: Add via UI
   - Laravel Vapor: Add via Vapor UI
   - Docker: Use secrets

3. **Monitor usage**
   - Check Google AI Studio dashboard
   - Set up billing alerts
   - Track costs

4. **Rotate keys regularly**
   - Especially if exposed or shared
   - Easy to generate new key

## Support

**Official Docs:**
- Gemini API: https://ai.google.dev/docs
- Pricing: https://ai.google.dev/pricing
- Models: https://ai.google.dev/models

**ORVYN Docs:**
- See `API_KEYS_SETUP.md` for all API keys
- See `backend/README.md` for backend details
- Check logs: `backend/storage/logs/laravel.log`

---

**Ready to test?** Run `php test-gemini.php` after adding your key! 🚀
