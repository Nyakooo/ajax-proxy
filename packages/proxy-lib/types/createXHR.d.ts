import { RefGlobalState } from "./types";
export declare const OriginXHR: {
    new (): XMLHttpRequest;
    prototype: XMLHttpRequest;
    readonly DONE: number;
    readonly HEADERS_RECEIVED: number;
    readonly LOADING: number;
    readonly OPENED: number;
    readonly UNSENT: number;
};
export declare const initInterceptorXHRState: (state: RefGlobalState) => RefGlobalState<import("./types").IGlobalState>;
declare class CustomXHR extends XMLHttpRequest {
    responseText: string;
    response: any;
    status: number;
    statusText: string;
    method: string;
    body?: Document | XMLHttpRequestBodyInit | null;
    private message_once_lock;
    constructor();
    private getMethod;
    private maybeNeedModifyRes;
    private overrideAttr;
    private watchAndOverride;
}
export default CustomXHR;
