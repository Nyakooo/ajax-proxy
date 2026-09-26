import type { V3Backup, V3ValidationIssue } from '@proxy/v3-domain';
export interface V3RuntimeController {
    readonly fetch: typeof window.fetch;
    readonly xhr: typeof window.XMLHttpRequest;
    readonly backup: V3Backup | null;
    readonly diagnosticsArmed: boolean;
    setDiagnosticsArmed(armed: boolean): void;
    readonly fetchOutcomeDiagnosticsArmed: boolean;
    setFetchOutcomeDiagnosticsArmed(armed: boolean): void;
    update(target: unknown): V3RuntimeUpdateResult;
}
export type V3RuntimeUpdateResult = {
    ok: true;
    status: 'updated' | 'cleared';
} | {
    ok: false;
    issues: V3ValidationIssue[];
};
export declare function createV3RuntimeController(host: Window, pageFetchAtLoad: typeof window.fetch, pageXHRAtLoad: typeof window.XMLHttpRequest): V3RuntimeController;
