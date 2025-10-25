import { Hono } from 'hono'
import fs from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { connect, createSigner } from '@permaweb/aoconnect'
import Arweave from 'arweave'
import { AO } from '@/utils/ao'

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
    console.log(src)

    const spawnedProcess = await ao.spawn({})
    const runRes = await ao.runLua({ processId: spawnedProcess, code: src })
    console.log(runRes)

    // if run was successful, write the process id to the file
    if (runRes.status === 200) {
        fs.writeFileSync(filepath, runRes.process)
    }

    return c.text(runRes.process)
})

export default subspace
