import { RefGlobalState } from "./types";
export declare const OriginFetch: ((input: URL | RequestInfo, init?: RequestInit | undefined) => Promise<Response>) & typeof fetch;
export declare const initInterceptorFetchState: (state: RefGlobalState) => RefGlobalState<import("./types").IGlobalState>;
declare function CustomFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
export default CustomFetch;
