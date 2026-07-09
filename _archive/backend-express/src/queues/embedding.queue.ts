import { Queue } from 'bullmq'
import { getRedisClient, checkRedisAvailable } from '../config/redis.js'
import { EventEmitter } from 'events'

// Dedicated custom memory emitter to act as our local background queue in the sandbox environment
class MemoryQueue extends EventEmitter {
  async add(name: string, data: any) {
    console.log(`📥 [ORVYN Sandbox Queue] Received job "${name}" for task ID ${data.taskId}. Enqueueing in memory...`)
    
    // Defer execution asynchronously to avoid blocking the main server thread
    setImmediate(() => {
      this.emit('job', { name, data })
    })
    return { id: `mock-job-${Date.now()}` }
  }
}

export const memoryEmbeddingQueue = new MemoryQueue()

let bullMQQueue: Queue | null = null

if (checkRedisAvailable()) {
  try {
    bullMQQueue = new Queue('EmbeddingQueue', {
      connection: getRedisClient()
    })
    console.log('✅ [ORVYN Queue] BullMQ Embedding Queue initialized with active Redis server.')
  } catch (e: any) {
    console.warn('⚠️ [ORVYN Queue] Failed to initialize BullMQ Queue. Falling back to sandbox memory-mode:', e.message)
  }
}

export class EmbeddingQueue {
  static async addEmbeddingJob(taskId: string, title: string, description: string) {
    const data = { taskId, title, description }

    if (checkRedisAvailable() && bullMQQueue) {
      try {
        const job = await bullMQQueue.add('generateTaskEmbedding', data, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        })
        console.log(`📥 [ORVYN Queue] Enqueued BullMQ job ${job.id} for task ID ${taskId}.`)
        return job
      } catch (e: any) {
        console.error('❌ [ORVYN Queue] Error adding to BullMQ queue, falling back to memory execution:', e.message)
        return await memoryEmbeddingQueue.add('generateTaskEmbedding', data)
      }
    } else {
      return await memoryEmbeddingQueue.add('generateTaskEmbedding', data)
    }
  }
}
