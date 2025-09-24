import { Hono } from 'hono'

const health = new Hono()

// Basic health check endpoints
health.get('/', (c) => c.text("OK"))
health.get('/health', (c) => c.text("OK"))

export default health
