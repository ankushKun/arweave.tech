import { connect } from "@permaweb/aoconnect"
import { log, withDuration } from "./logger";
import { Constants, Defaults } from "./constants";

interface MainnetOptions {
    GATEWAY_URL: string;
    HB_URL: string;
    signer?: any;
    address?: string;
}

interface WriteResponse {
    info: string
    commitments: Array<Record<string, any>>
    outbox: Array<Record<string, any>>
    output: { data: any, prompt: string }
    process: string
    slot: number
    status: number
    error: ErrorResponse
}

export interface ErrorResponse {
    'x-action': string
    'x-error': string
    'x-status': number
    timestamp: number
}

export class WriteError extends Error {
    public action: string
    public status: number
    public timestamp: number
    public error: ErrorResponse

    constructor(error: ErrorResponse) {
        super(JSON.stringify(error, null, 2))
        this.action = error["x-action"]
        this.status = error["x-status"]
        this.timestamp = error.timestamp
        this.error = error
    }
}

export class AO {
    public hbUrl: string;
    public gatewayUrl: string;
    private signer?: any;
    public address?: string;
    public operatorAddress?: string;

    constructor(params: MainnetOptions) {
        this.hbUrl = params.HB_URL || Defaults.HB_URL;
        this.gatewayUrl = params.GATEWAY_URL || Defaults.GATEWAY_URL;
        this.signer = params.signer;
        this.address = params.address;
        this.operatorAddress = undefined;
    }

    public ao() {
        return connect({
            MODE: "mainnet",
            URL: this.hbUrl,
            GATEWAY_URL: this.gatewayUrl,
            signer: this.signer,
            device: "process@1.0",
        })
    }

    validateArweaveId(id: string): string {
        if (!/^[A-Za-z0-9_-]{43}$/.test(id)) {
            throw new Error('Invalid Arweave transaction ID');
        }
        return id;
    }

    sanitizeResponse(input: Record<string, any>) {
        const blockedKeys = new Set<string>([
            'accept',
            'accept-bundle',
            'accept-encoding',
            'accept-language',
            'connection',
            'commitments',
            'device',
            'host',
            'method',
            'priority',
            'status',
            'sec-ch-ua',
            'sec-ch-ua-mobile',
            'sec-ch-ua-platform',
            'sec-fetch-dest',
            'sec-fetch-mode',
            'sec-fetch-site',
            'sec-fetch-user',
            'sec-gpc',
            'upgrade-insecure-requests',
            'user-agent',
            'x-forwarded-for',
            'x-forwarded-proto',
            'x-real-ip',
            'origin',
            'referer',
            'cdn-loop',
            'cf-connecting-ip',
            'cf-ipcountry',
            'cf-ray',
            'cf-visitor',
            'remote-host',
        ])
        return Object.fromEntries(
            Object.entries(input).filter(([key]) => !blockedKeys.has(key))
        );
    }

    checkErrors(e: WriteResponse): WriteResponse {
        const errMessage = this.matchAction<ErrorResponse>("error", e)
        if (errMessage) {
            e.error = errMessage
        }
        return e
    }

    matchAction<T>(action: string, e: WriteResponse): T | null {
        const outbox = e.outbox
        if (!Array.isArray(outbox)) return null

        if (outbox.length === 0) return null
        const message = outbox.find(o => o['action'] === action)
        if (!message) return null
        if (message.data) {
            return JSON.parse(message.data) as T
        }
        return message as T
    }

    async operator(): Promise<string> {
        if (this.operatorAddress) return this.operatorAddress
        if (!this.hbUrl) throw new Error("HB URL not set")
        const hashpath = this.hbUrl + '/~meta@1.0/info/address'
        log({ type: "input", label: "Fetching Operator Address", data: hashpath })
        const { result, duration } = await withDuration(() => fetch(hashpath))
        const scheduler = (await result.text()).trim()
        log({ type: "success", label: "Fetched Operator Address", data: scheduler, duration })
        this.operatorAddress = scheduler
        return scheduler
    }

    async read<T>({ path, bundle = true }: { path: string, bundle?: boolean }): Promise<T> {
        let hashpath = this.hbUrl + (path.startsWith("/") ? path : "/" + path)
        // hashpath = hashpath + "/~json@1.0/serialize"

        log({ type: "input", label: "Reading Process State", data: hashpath })
        const { result, duration } = await withDuration(() => fetch(hashpath, {
            headers: {
                'accept': "application/json",
                'accept-bundle': bundle ? 'true' : 'false',
            }
        }))
        if (result.status != 200) {
            log({ type: "error", label: `Error ${result.status} ${result.statusText}`, data: hashpath, duration })
            throw new Error(`Error ${result.status} ${result.statusText}`)
        }
        const resultJson = await result.json()
        log({ type: "output", label: "Process State Read", data: resultJson, duration })

        const sanitized = this.sanitizeResponse(resultJson)

        // Check if ao-result exists and extract the value from the specified key
        if (sanitized['ao-result'] && typeof sanitized['ao-result'] === 'string') {
            const targetKey = sanitized['ao-result']
            if (sanitized[targetKey] !== undefined) {
                return sanitized[targetKey] as T
            }
        }

        return sanitized as T
    }

    async write({ processId, tags, data }: { processId: string, tags?: { name: string; value: string }[], data?: any }): Promise<WriteResponse | null> {
        const params: any = {
            path: `/${processId}/push`,
            method: 'POST',
            type: 'Message',
            'data-protocol': 'ao',
            variant: 'ao.N.1',
            target: processId,
            'signing-format': 'ANS-104',
            accept: 'application/json',
            'accept-bundle': "true",
        }

        if (tags) {
            tags.forEach(tag => {
                params[tag.name] = tag.value
            })
        }

        if (data) {
            params.data = data
        }

        log({ type: "input", label: "Write Input", data: { ...params, currentAddress: this.address, hasSigner: !!this.signer } })
        const { result, duration } = await withDuration(() => this.ao().request(params))
        let res = this.checkErrors(await JSON.parse((result as any).body) as WriteResponse)
        log({ type: res.error ? "error" : "output", label: res.error ? "Write Error" : "Write Success", data: res, duration })
        if (res.error) {
            const xErrorAction = res.error?.['x-action']
            const xErrorMsg = res.error?.['x-error']
            const xErrorStatus = res.error?.['x-status']
            throw new WriteError(res.error)
        }
        return res
    }

    async runLua({ processId, code }: { processId: string, code: string }): Promise<WriteResponse> {
        log({ type: "debug", label: "Run Lua Input", data: { processId, code } })
        const { result, duration } = await withDuration(() => this.write({
            processId,
            tags: [
                { name: "Action", value: "Eval" }
            ],
            data: code
        }))
        log({ type: "success", label: "Run Lua Output", data: result ? result : "No result", duration })
        return result as WriteResponse
    }

    async spawn({ tags, data, module_ }: { tags?: { name: string; value: string }[], data?: any, module_?: string }): Promise<string> {
        const params: any = {
            path: '/push',
            method: 'POST',
            type: 'Process',
            device: 'process@1.0',
            'scheduler-device': 'scheduler@1.0',
            'push-device': 'push@1.0',
            'execution-device': 'lua@5.3a',
            'data-protocol': 'ao',
            variant: 'ao.N.1',
            random: Math.random().toString(),
            authority: await this.operator() + ',' + Constants.authority,
            'signing-format': 'ANS-104',
            module: module_ || Constants.hyperAosModule,
            scheduler: await this.operator(),
            accept: 'application/json',
        }

        if (tags) {
            tags.forEach(tag => {
                params[tag.name] = tag.value
            })
        }

        if (data) {
            params.data = data
        }

        log({ type: "input", label: "Spawning Process", data: params })
        // const { result, duration } = await withDuration(() => this.ao().request(params))
        try {
            const result = await this.ao().request(params)
            log({ type: "success", label: "Process Spawned", data: result })
            const process = (result as any).process
            await new Promise(resolve => setTimeout(resolve, 100))
            const { result: result2, duration: duration2 } = await withDuration(() => this.runLua({ processId: process, code: "require('.process')._version" }))
            log({ type: "success", label: "Process Initialized", data: { version: result2 }, duration: duration2 })
            return process
        } catch (e) {
            throw e
        }
    }
}