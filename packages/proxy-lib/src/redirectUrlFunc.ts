import { IRedirectHeader } from './types';


const errLog = function (...args: any[]) {
    console.log("%c[AjaxProxy][error]: ", "color: #ff4d4f", ...args)
}

type Req = {
    url: string
    method: string
}

type Next = {
    url: string,
    headers?: { [key: IRedirectHeader['key']]: IRedirectHeader['value'] }
}

function isNext(x: any): x is Next {
    if (!!x) return true
    if (x.url && !x.headers) return true
    return x.headers && Object.prototype.toString.call(x.headers) == '[object Object]'
}

export function execSetup(req: Req, funcText: string): Promise<Next> {
    return new Promise(resolve => {
        try {
            const source = ';(' + funcText + ')'
            const execFunc = window.eval(source)
            const type = typeof execFunc
            if (type === "function") {
                if (!funcText.includes('next(')) {
                    errLog("The structure of 'next' is incorrect [code 1]")
                    // original
                    return resolve({ url: req.url })
                }
                execFunc(req, (next: Next) => {
                    // custom
                    if (isNext(next)) {
                        return resolve({ url: next.url, headers: next.headers })
                    }
                })
                return resolve({ url: req.url })
            }
            errLog("Please enter a correct 'function' [code 2]")
            return resolve({ url: req.url })
        } catch (error) {
            errLog(error)
            return resolve({ url: req.url })
        }
    })
}