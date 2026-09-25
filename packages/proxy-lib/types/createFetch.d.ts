import { RefGlobalState } from "./types";
export declare const OriginFetch: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & typeof fetch;
export declare const initInterceptorFetchState: (state: RefGlobalState) => RefGlobalState;
declare function CustomFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
export default CustomFetch;
