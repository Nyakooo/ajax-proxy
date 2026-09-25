import type { V3Rule } from '@proxy/v3-domain';
export type V3Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export interface V3FetchOptions {
    getRules: () => readonly V3Rule[];
    onMatched?: (rule: V3Rule, index: number) => void;
}
/**
 * Build a Fetch wrapper that applies one V3 rule across the request and
 * response stages. This prototype is not wired into the extension entry yet.
 */
export declare function createV3Fetch(fetcher: V3Fetch, options: V3FetchOptions): V3Fetch;
