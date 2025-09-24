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
    return c.json({ process })
})

lcs.post('/cat/process', (c) => {
    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, '')
    }
    const process = c.req.param('process') || ''
    fs.writeFileSync(filepath, process)
    return c.json({ process })
})

export default lcs
