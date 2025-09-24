import { Hono } from 'hono'
import fs from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const filepath = join(homedir(), '.subspace.txt')
const subspace = new Hono()

function verifyBasicAuth(authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        throw new Error('Invalid Authorization header')
    }
    const base64Credentials = authHeader.slice(6) // Remove 'Basic ' prefix
    const password = atob(base64Credentials)
    if (password !== process.env.ADMIN_PASS) {
        throw new Error('Invalid Authorization header')
    }
}

subspace.get('/subspace/process', (c) => {
    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, '')
    }
    const processId = fs.readFileSync(filepath, 'utf8') || ''
    return c.text(processId)
})

subspace.post('/subspace/process', async (c) => {

    const authHeader = c.req.header('Authorization')
    verifyBasicAuth(authHeader || '')

    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, '')
    }
    const processId = (await c.req.json()).process || ''
    fs.writeFileSync(filepath, processId)
    return c.text(processId)
})

export default subspace
