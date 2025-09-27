import { Hono } from 'hono'
import dotenv from 'dotenv'
dotenv.config()
import { cors } from 'hono/cors'

import health from './routes/health'
import system from './routes/system'
import lcs from './routes/lcs'
import subspace from './routes/subspace'
import etgl from './routes/etgl'

const app = new Hono()
app.use(cors({ origin: '*' }))

// Mount route modules
app.route('/', health)
app.route('/', system)
app.route('/', lcs)
app.route('/', subspace)
app.route('/', etgl)

// Initialize WebSocket server for GPS coordinate sharing automatically
import { initializeWebSocketServer } from './routes/etgl'

// Start WebSocket server automatically
setTimeout(() => {
    try {
        initializeWebSocketServer(3002)
        console.log('WebSocket server automatically initialized on port 3002')
    } catch (error) {
        console.error('Failed to auto-initialize WebSocket server:', error)
    }
}, 1000) // 1 second delay to ensure API server is ready

console.log('API server ready. WebSocket server will auto-initialize in 1 second.')

export default {
    port: 3001,
    fetch: app.fetch,
}