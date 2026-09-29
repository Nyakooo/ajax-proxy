import { NoticeFrom, NoticeTo } from './index';
export declare const V3PanelMessageKey: {
    readonly GET_SNAPSHOT: "ajax-proxy:notice:v3:get-snapshot";
    readonly SAVE_CONFIG: "ajax-proxy:notice:v3:save-config";
    readonly CLEAR_HIT_COUNTERS: "ajax-proxy:notice:v3:clear-hit-counters";
};
export type V3PanelValidationIssue = {
    path: string;
    message: string;
};
export type V3PanelGetSnapshotRequest = {
    from: NoticeFrom.PANELS;
    to: NoticeTo.SERVICE_WORKER;
    key: typeof V3PanelMessageKey.GET_SNAPSHOT;
};
export type V3PanelSaveConfigRequest = {
    from: NoticeFrom.PANELS;
    to: NoticeTo.SERVICE_WORKER;
    key: typeof V3PanelMessageKey.SAVE_CONFIG;
    value: {
        config: unknown;
        expectedRevision: string;
    };
};
export type V3PanelClearHitCountersTarget = {
    scope: 'all';
} | {
    scope: 'rule';
    ruleId: string;
};
export type V3PanelClearHitCountersRequest = {
    from: NoticeFrom.PANELS;
    to: NoticeTo.SERVICE_WORKER;
    key: typeof V3PanelMessageKey.CLEAR_HIT_COUNTERS;
    value: V3PanelClearHitCountersTarget;
};
export type V3PanelMessage = V3PanelGetSnapshotRequest | V3PanelSaveConfigRequest | V3PanelClearHitCountersRequest;
export type V3PanelGetSnapshotResponse = {
    ok: true;
    snapshot: {
        config: unknown | null;
        hitCounters: Record<string, number>;
        revision: string;
    };
} | {
    ok: false;
    issues: V3PanelValidationIssue[];
} | {
    ok: false;
    error: 'storage-read-failed';
};
export type V3PanelSaveConfigResponse = {
    ok: true;
    revision: string;
} | {
    ok: false;
    issues: V3PanelValidationIssue[];
} | {
    ok: false;
    error: 'storage-write-failed' | 'storage-read-failed';
} | {
    ok: false;
    error: 'config-conflict';
    current: {
        config: unknown | null;
        revision: string;
    };
};
export type V3PanelClearHitCountersResponse = {
    ok: true;
    hitCounters: Record<string, number>;
} | {
    ok: false;
    issues: V3PanelValidationIssue[];
} | {
    ok: false;
    error: 'storage-read-failed' | 'storage-write-failed' | 'rule-not-found';
};
/** Guard the strict panel-to-service-worker V3 snapshot request envelope. */
export declare function isV3PanelGetSnapshotRequest(value: unknown): value is V3PanelGetSnapshotRequest;
/** Guard the strict panel-to-service-worker V3 configuration save envelope. */
export declare function isV3PanelSaveConfigRequest(value: unknown): value is V3PanelSaveConfigRequest;
/** Guard a request to clear all V3 hit counters or one rule's counter. */
export declare function isV3PanelClearHitCountersRequest(value: unknown): value is V3PanelClearHitCountersRequest;
/** Guard either supported V3 panel request. */
export declare function isV3PanelMessage(value: unknown): value is V3PanelMessage;
