type Ctx = {
    req: {
        url: string
        method: string
        body?: any
    }
    res: {
        status: string
        customStatus: string
        response: any
    }
}

type Next = {
    override?: string
    status?: string | number
}

const FAILURE_MARKER = Symbol.for('ajax-proxy.custom-function-fail-open')
const FUNCTION_TIMEOUT_MS = 5000

function normalizeNext(value: unknown, customStatus: string): Next | undefined {
    if (!value || typeof value !== 'object') return undefined
    const next = value as Partial<Next>
    if (!('override' in next) && !('status' in next)) return undefined
    return {
        override: next.override ?? '',
        status: next.status ?? customStatus,
    }
}

function runCustomFunction(
    funcText: string,
    args: unknown[],
    normalize: (value: unknown) => Next | undefined,
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
            const normalized = normalize(value)
            if (normalized === undefined) finishFailure()
            else finish(normalized)
        }

        try {
            const execFunc = window.eval(`;(${funcText})`)
            if (typeof execFunc !== 'function') {
                console.error('[AjaxProxy][error] Invalid interceptor function')
                finishFailure()
                return
            }

            const result = execFunc(...args, complete)
            Promise.resolve(result).then(value => {
                if (value !== undefined) complete(value)
            }, error => {
                console.error('[AjaxProxy][error] interceptor function rejected', error)
                finishFailure()
            })
        } catch (error) {
            console.error('[AjaxProxy][error] interceptor function failed', error)
            finishFailure()
        }
    })
}

export function getCtx(
    url: string,
    method: string,
    status: string | number,
    customStatus: string,
    body?: any,
    response?: any
): Ctx {
    return {
        req: { url, method, body },
        res: { status: status.toString(), customStatus, response },
    }
}

export function execSetup(ctx: Ctx, funcText: string): Promise<Next> {
    return runCustomFunction(
        funcText,
        [ctx.req, ctx.res],
        value => normalizeNext(value, ctx.res.customStatus),
        { override: '', status: ctx.res.customStatus }
    )
}
