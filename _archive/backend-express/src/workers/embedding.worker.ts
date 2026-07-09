import { Worker, Job } from 'bullmq'
import { getRedisClient, checkRedisAvailable } from '../config/redis.js'
import { GeminiService } from '../services/gemini.service.js'
import { memoryEmbeddingQueue } from '../queues/embedding.queue.js'
import prisma from '../config/db.js'

// Simple sandbox in-memory vector cache to simulate pgvector in offline database environments
export const sandboxEmbeddingsStore: Record<string, { embedding: number[]; chunkContent: string }> = {}

/**
 * Core business logic that handles embedding generation and db persistence.
 * Reusable across BullMQ and Sandbox Memory Queues.
 */
export async function processEmbeddingJob(taskId: string, title: string, description: string) {
  console.log(`⚙️ [ORVYN Worker] Starting embedding generation for Task: "${title}" (ID: ${taskId})`)
  
  const chunkContent = `${title}. ${description || ''}`
  
  // Call Gemini Embedding service (or mock wave fallback)
  const embedding = await GeminiService.generateEmbedding(chunkContent)
  
  try {
    // Attempt database write to PostgreSQL task_embeddings using pgvector raw SQL format
    await prisma.$executeRawUnsafe(`
      INSERT INTO task_embeddings (id, task_id, embedding, chunk_content, created_at)
      VALUES (
        gen_random_uuid(),
        $1::uuid,
        $2::vector,
        $3,
        NOW()
      )
      ON CONFLICT DO NOTHING
    `, taskId, `[${embedding.join(',')}]`, chunkContent)
    
    console.log(`✅ [ORVYN Worker] Saved vector embedding successfully to PostgreSQL task_embeddings table for Task ID: ${taskId}.`)

  } catch (dbError: any) {
    console.warn(`⚠️ [ORVYN Worker] Database write failed. Falling back to sandbox cache memory store. Error: ${dbError.message}`)
    
    // Save to sandbox cache store for semantic RAG querying simulation
    sandboxEmbeddingsStore[taskId] = {
      embedding,
      chunkContent
    }
    console.log(`💾 [ORVYN Worker] Saved vector embedding inside local sandbox memory store for Task ID: ${taskId}.`)
  }
}

// 1. Initialize Sandbox Queue Listener
memoryEmbeddingQueue.on('job', async ({ name, data }) => {
  if (name === 'generateTaskEmbedding') {
    try {
      await processEmbeddingJob(data.taskId, data.title, data.description)
    } catch (e: any) {
      console.error('❌ [ORVYN Sandbox Worker] Error processing embedding job in memory:', e.message)
    }
  }
})

// 2. Initialize BullMQ Worker (only if Redis is available)
if (checkRedisAvailable()) {
  try {
    const worker = new Worker('EmbeddingQueue', async (job: Job) => {
      if (job.name === 'generateTaskEmbedding') {
        await processEmbeddingJob(job.data.taskId, job.data.title, job.data.description)
      }
    }, {
      connection: getRedisClient()
    })

    worker.on('completed', (job) => {
      console.log(`✅ [ORVYN Queue Worker] Job ${job.id} completed embedding generation.`)
    })

    worker.on('failed', (job, err) => {
      console.error(`❌ [ORVYN Queue Worker] Job ${job?.id} failed with error:`, err.message)
    })

    console.log('✅ [ORVYN Queue Worker] BullMQ Embedding Worker registered successfully.')
  } catch (e: any) {
    console.warn('⚠️ [ORVYN Queue Worker] Failed to start BullMQ worker loop. Running in sandbox-only mode:', e.message)
  }
}
