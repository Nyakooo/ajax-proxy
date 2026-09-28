import { IRedirectHeader } from './types'

type Req = {
    url: string
    method: string
}

type Next = {
    url: string
    headers?: { [key: IRedirectHeader['key']]: IRedirectHeader['value'] }
}

const FAILURE_MARKER = Symbol.for('ajax-proxy.custom-function-fail-open')
const FUNCTION_TIMEOUT_MS = 5000

function normalizeNext(value: unknown): Next | undefined {
    if (!value || typeof value !== 'object') return undefined
    const next = value as Partial<Next>
    if (typeof next.url !== 'string') return undefined
    if (next.headers !== undefined && (!next.headers || Object.prototype.toString.call(next.headers) !== '[object Object]')) {
        return undefined
    }
    return { url: next.url, headers: next.headers }
}

function runCustomFunction(
    funcText: string,
    req: Req,
    fallback: Next
): Promise<Next> {
    return new Promise(resolve => {
        let settled = false
        const timer = setTimeout(() => finishFailure(), FUNCTION_TIMEOUT_MS)

        function finish(value: Next) {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve(value)
        }

        function finishFailure() {
            Object.defineProperty(fallback, FAILURE_MARKER, { value: true })
            finish(fallback)
        }

        function complete(value: unknown) {
            const normalized = normalizeNext(value)
            if (normalized === undefined) finishFailure()
            else finish(normalized)
        }

        try {
            const execFunc = window.eval(`;(${funcText})`)
            if (typeof execFunc !== 'function') {
                console.error('[AjaxProxy][error] Invalid redirect function')
                finishFailure()
                return
            }

            const result = execFunc(req, complete)
            Promise.resolve(result).then(value => {
                if (value !== undefined) complete(value)
            }, error => {
                console.error('[AjaxProxy][error] redirect function rejected', error)
                finishFailure()
            })
        } catch (error) {
            console.error('[AjaxProxy][error] redirect function failed', error)
            finishFailure()
        }
    })
}

export function execSetup(req: Req, funcText: string): Promise<Next> {
    return runCustomFunction(funcText, req, { url: req.url })
}
