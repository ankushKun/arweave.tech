import { Hono } from 'hono'
import fs from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const filepath = join(homedir(), '.lcs.txt')
const lcs = new Hono()

lcs.get('/cat/process', (c) => {
    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, '')
    }
    const process = fs.readFileSync(filepath, 'utf8') || ''
    return c.text(process)
})

lcs.post('/cat/process', async (c) => {
    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, '')
    }
    const process = (await c.req.json()).process || ''
    console.log(process)
    fs.writeFileSync(filepath, process)
    return c.text(process)
})

export default lcs
