import { Hono } from 'hono'
import fs from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { connect, createSigner } from '@permaweb/aoconnect'
import Arweave from 'arweave'
import { AO } from '@/utils/ao'
import { StatusCode } from 'hono/utils/http-status'
import { HTTPException } from 'hono/http-exception'

const filepath = join(homedir(), '.subspace.txt')
const subspace = new Hono()
const ar = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
})
const wallet = await ar.wallets.generate()
const signer = createSigner(wallet)
const ao = new AO({ signer, GATEWAY_URL: "https://arweave.tech", HB_URL: "https://hb.arweave.tech" })

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
    const srcUrl = "https://raw.githubusercontent.com/subspace-dev/sdk/refs/heads/hb/logic/subspace.lua"
    const src = await fetch(srcUrl).then(res => res.text())

    const spawnedProcess = await ao.spawn({})
    const runRes = await ao.runLua({ processId: spawnedProcess, code: src })

    // if run was successful, write the process id to the file
    if (runRes.status === 200) {
        fs.writeFileSync(filepath, runRes.process)
    }

    return c.text(runRes.process)
})

subspace.post('/subspace/spawn-dm-process', async (c) => {
    const body = await c.req.json()
    const { owner } = body

    if (owner.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(owner)) {
        throw new HTTPException(400, { message: "Invalid owner address" })
    }

    const dmUrl = "https://raw.githubusercontent.com/subspace-dev/sdk/refs/heads/hb/logic/dms.lua"
    let dmSrc = await fetch(dmUrl).then(res => res.text())
    const subspaceProcessId = fs.readFileSync(filepath, 'utf8') || ''
    dmSrc = `owner = "${owner}"\n\n`
    dmSrc = dmSrc.replace("<<SUBSPACE>>", subspaceProcessId)

    const spawnedProcess = await ao.spawn({})
    const runRes = await ao.runLua({ processId: spawnedProcess, code: dmSrc })
    if (runRes.status === 200) {
        return c.text(spawnedProcess)
    } else {
        return c.status(runRes.status as StatusCode)
    }
})

export default subspace
