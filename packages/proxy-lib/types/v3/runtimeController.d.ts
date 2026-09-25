import type { V3Backup } from '@proxy/v3-domain';
export interface V3RuntimeController {
    readonly fetch: typeof window.fetch;
    readonly xhr: typeof window.XMLHttpRequest;
    readonly backup: V3Backup | null;
    update(target: unknown): boolean;
}
export declare function createV3RuntimeController(host: Window, pageFetchAtLoad: typeof window.fetch, pageXHRAtLoad: typeof window.XMLHttpRequest): V3RuntimeController;
