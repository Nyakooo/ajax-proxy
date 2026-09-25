import { RefGlobalState } from './types';
export declare const OriginXHR: {
    new (): XMLHttpRequest;
    prototype: XMLHttpRequest;
    readonly UNSENT: 0;
    readonly OPENED: 1;
    readonly HEADERS_RECEIVED: 2;
    readonly LOADING: 3;
    readonly DONE: 4;
};
export declare const initInterceptorXHRState: (state: RefGlobalState) => RefGlobalState;
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
