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

subspace.post('/subspace/respawn', async (c) => {
    return c.status(501)
})

subspace.post('/subspace/waitlist', async (c) => {
    const email = (await c.req.json()).email || ''
    if (!email) {
        return c.status(400)
    }
    const sheetdb = "https://sheetdb.io/api/v1/konjhejkzjff3"

    try {
        const response = await fetch(sheetdb, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: {
                    email: email,
                    time: new Date().toISOString()
                }
            })
        })

        if (!response.ok) {
            throw new Error(`SheetDB API error: ${response.status}`)
        }

        const result = await response.json()
        return c.json({ success: true, data: result })
    } catch (error) {
        console.error('Error adding to waitlist:', error)
        return c.status(500)
    }
})

export default subspace
