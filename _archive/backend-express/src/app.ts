import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import http from 'http'
import { Server } from 'socket.io'
import prisma from './config/db.js'
import taskRouter from './routes/task.routes.js'
import './workers/embedding.worker.js'

// Load environment variables
dotenv.config()

const app = express()
const server = http.createServer(app)

// Initialize Socket.io with robust CORS settings
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  }
})

// Enable JSON parser and CORS
app.use(cors())
app.use(express.json())

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() })
})

// Mount Active Task Ingestion & Matrix Routes
app.use('/api/tasks', taskRouter)

// Socket.io Real-time connection handler
io.on('connection', (socket) => {
  console.log(`[ORVYN WSS] Student connected: ${socket.id}`)

  socket.on('disconnect', () => {
    console.log(`[ORVYN WSS] Student disconnected: ${socket.id}`)
  })
})

// Global Error Handler Middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[ORVYN Server Error]:', err.message)
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.',
  })
})

const PORT = process.env.PORT || 4000

server.listen(PORT, () => {
  console.log(`⚡ [ORVYN OS] Backend server booting on http://localhost:${PORT}`)
})

export { app, server, io }
