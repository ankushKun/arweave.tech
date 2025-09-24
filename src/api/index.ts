import { Hono } from 'hono'
import dotenv from 'dotenv'
dotenv.config()
import { cors } from 'hono/cors'

import health from './routes/health'
import system from './routes/system'
import lcs from './routes/lcs'
import subspace from './routes/subspace'

const app = new Hono()
app.use(cors({ origin: '*' }))

// Mount route modules
app.route('/', health)
app.route('/', system)
app.route('/', lcs)
app.route('/', subspace)

export default {
    port: 3001,
    fetch: app.fetch,
}