import type { V3RuntimeHostOptions } from './runtimeOptions';
export type V3Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type V3FetchOptions = V3RuntimeHostOptions;
/**
 * Build a Fetch wrapper that applies one V3 rule across the request and
 * response stages. The extension host owns configuration, diagnostics, and mounting.
 */
export declare function createV3Fetch(fetcher: V3Fetch, options: V3FetchOptions): V3Fetch;
