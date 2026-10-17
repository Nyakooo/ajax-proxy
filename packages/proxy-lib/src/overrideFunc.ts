

const errLog = function (...args: any[]) {
    console.log("%c[AjaxProxy][error]: ", "color: #ff4d4f", ...args)
}

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

function isNext(x: any): x is Next {
    return !!x && (x.override || x.status)
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

function overrideNext<T extends Next>(next: T, customStatus: string): T {
    if (isNext(next)) {
        // 默认status
        if (!next.status) next.status = customStatus
        // 默认响应值
        if (!next.override) next.override = ""
        return next
    }
    return { override: "", status: customStatus } as T
}

export function execSetup(ctx: Ctx, funcText: string): Promise<Next> {
    return new Promise(resolve => {
        try {
            const source = ';(' + funcText + ')'
            const execFunc = window.eval(source)
            const type = typeof execFunc
            if (type === "function") {
                if (!funcText.includes('next(')) {
                    errLog("The structure of 'next' is incorrect [code 1]")
                    return resolve({ override: "", status: ctx.res.customStatus })
                }
                execFunc(ctx.req, ctx.res, (next: Next) => {
                    const overrideData = overrideNext(next, ctx.res.customStatus)
                    return resolve(overrideData)
                })
            } else {
                errLog("Please enter a correct 'function' [code 2]")
                return resolve({ override: "", status: ctx.res.customStatus })
            }
        } catch (error) {
            errLog(error)
            return resolve({ override: "", status: ctx.res.customStatus })
        }
    })
}