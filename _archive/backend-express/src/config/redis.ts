import { Redis } from 'ioredis'
import { EventEmitter } from 'events'

let redisClient: Redis | null = null
let isRedisAvailable = false

// An in-memory mock client to ensure the application starts without Redis server dependencies
class RedisMock extends EventEmitter {
  private store: Record<string, string> = {}

  async get(key: string): Promise<string | null> {
    return this.store[key] || null
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store[key] = value
    return 'OK'
  }

  async del(key: string): Promise<number> {
    const exists = this.store[key] ? 1 : 0
    delete this.store[key]
    return exists
  }
}

const mockRedis = new RedisMock()

try {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  console.log(`📡 [ORVYN Redis] Attempting connection to ${redisUrl}...`)
  
  // Establish Redis client with short connection timeout to prevent hanging the boot cycle
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true
  })

  redisClient.on('connect', () => {
    isRedisAvailable = true
    console.log('✅ [ORVYN Redis] Connected to Redis server successfully.')
  })

  redisClient.on('error', (err) => {
    isRedisAvailable = false
    console.warn('⚠️ [ORVYN Redis] Redis server is offline. Falling back to sandbox memory-mode.')
  })

  // Start connecting asynchronously
  redisClient.connect().catch(() => {
    isRedisAvailable = false
  })
} catch (e) {
  isRedisAvailable = false
  console.warn('⚠️ [ORVYN Redis] Exception trying to boot Redis. Falling back to sandbox memory-mode.')
}

export function getRedisClient() {
  return isRedisAvailable ? redisClient : (mockRedis as any)
}

export function checkRedisAvailable(): boolean {
  return isRedisAvailable
}
