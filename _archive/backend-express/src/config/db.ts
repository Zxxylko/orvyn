import { PrismaClient } from '@prisma/client'

// Instantiate a single PrismaClient instance to reuse across the backend
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
})

export default prisma
