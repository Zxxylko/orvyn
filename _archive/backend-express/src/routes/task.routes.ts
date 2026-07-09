import { Router, Response } from 'express'
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js'
import { GeminiService } from '../services/gemini.service.js'
import { EmbeddingQueue } from '../queues/embedding.queue.js'
import prisma from '../config/db.js'

const router = Router()

// Shared in-memory database store for sandbox testing when Postgres is offline
export const sandboxTasksStore: any[] = [
  { id: 'mock-sandbox-task-1', userId: 'mock-sandbox-user-id-uuid-1234', title: 'Implement Red-Black Tree insertion in C++', deadline: new Date(Date.now() + 86400000).toISOString(), status: 'TODO', priority: 'HIGH', durationMinutes: 180, difficulty: 4, category: 'Algorithms', tags: ['Algorithms', 'C++'], aiProcessed: true, createdAt: new Date().toISOString() },
  { id: 'mock-sandbox-task-2', userId: 'mock-sandbox-user-id-uuid-1234', title: 'PostgreSQL Vector database research & pgvector benchmarking', deadline: new Date(Date.now() + 259200000).toISOString(), status: 'TODO', priority: 'MEDIUM', durationMinutes: 300, difficulty: 3, category: 'Databases', tags: ['Databases', 'pgvector'], aiProcessed: true, createdAt: new Date().toISOString() },
  { id: 'mock-sandbox-task-3', userId: 'mock-sandbox-user-id-uuid-1234', title: 'Complete Firebase Auth context wrapper hooks', deadline: new Date().toISOString(), status: 'COMPLETED', priority: 'MEDIUM', durationMinutes: 120, difficulty: 2, category: 'Software Eng', tags: ['Firebase', 'Auth'], aiProcessed: true, createdAt: new Date().toISOString() }
]

/**
 * GET /api/tasks
 * Returns all active tasks. Gracefully falls back to sandbox store if database is offline.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id

  try {
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })
    
    return res.json(tasks)
  } catch (error: any) {
    console.warn(`⚠️ [ORVYN Task Route] PostgreSQL offline. Falling back to sandbox memory-store. Error: ${error.message}`)
    
    // Filter sandbox tasks matching authenticated user id
    const filteredTasks = sandboxTasksStore.filter(t => t.userId === userId)
    return res.json(filteredTasks)
  }
})

/**
 * POST /api/tasks/smart-parse
 * Parses natural language input using the Gemini service and schedules background embedding generation.
 */
router.post('/smart-parse', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { input } = req.body
  const userId = req.user?.id

  if (!input || typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: 'Validation Error', message: 'The input parameter must be a non-empty string.' })
  }

  console.log(`📝 [ORVYN Tasks] Received smart task ingestion request: "${input}"`)

  try {
    // 1. Call Gemini structured NLP service
    const parsed = await GeminiService.parseTaskInput(input)
    
    let savedTask: any = null

    try {
      // 2. Persist Task to PostgreSQL using Prisma client
      savedTask = await prisma.task.create({
        data: {
          userId: userId!,
          title: parsed.title,
          description: input, // Store original raw prompt as description
          deadline: parsed.deadline ? new Date(parsed.deadline) : null,
          priority: parsed.priority as any,
          durationMinutes: parsed.durationMinutes,
          difficulty: parsed.difficulty,
          category: parsed.category,
          tags: parsed.tags,
          aiProcessed: true
        }
      })
      console.log(`✅ [ORVYN Tasks] Task persisted successfully in PostgreSQL (ID: ${savedTask.id}).`)

    } catch (dbError: any) {
      console.warn(`⚠️ [ORVYN Tasks] Database save failed. Saving inside sandbox cache. Error: ${dbError.message}`)
      
      // Fallback: Save task to in-memory sandbox store
      savedTask = {
        id: `mock-sandbox-task-${Date.now()}`,
        userId: userId!,
        title: parsed.title,
        description: input,
        deadline: parsed.deadline,
        status: 'TODO',
        priority: parsed.priority,
        durationMinutes: parsed.durationMinutes,
        difficulty: parsed.difficulty,
        category: parsed.category,
        tags: parsed.tags,
        aiProcessed: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      sandboxTasksStore.push(savedTask)
    }

    // 3. Dispatch background task to generate pgvector Embeddings
    await EmbeddingQueue.addEmbeddingJob(savedTask.id, savedTask.title, savedTask.description || '')

    // 4. Return new task resource instantly
    return res.status(201).json(savedTask)

  } catch (error: any) {
    console.error('❌ [ORVYN Tasks] Failed to execute smart-parse cycle:', error.message)
    return res.status(500).json({ error: 'Internal Server Error', message: error.message })
  }
})

export default router
