import { NoticeFrom, NoticeTo } from './index';
export declare const V3PanelMessageKey: {
    readonly GET_SNAPSHOT: "ajax-proxy:notice:v3:get-snapshot";
    readonly SAVE_CONFIG: "ajax-proxy:notice:v3:save-config";
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
export type V3PanelMessage = V3PanelGetSnapshotRequest | V3PanelSaveConfigRequest;
export type V3PanelGetSnapshotResponse = {
    ok: true;
    snapshot: {
        config: unknown | null;
        hitCounters: Record<string, number>;
        revision: string;
    };
} | {
    ok: false;
    issues?: V3PanelValidationIssue[];
    error?: 'storage-read-failed';
};
export type V3PanelSaveConfigResponse = {
    ok: true;
    revision: string;
} | {
    ok: false;
    issues?: V3PanelValidationIssue[];
    error?: 'storage-write-failed' | 'storage-read-failed';
} | {
    ok: false;
    error: 'config-conflict';
    current: {
        config: unknown | null;
        revision: string;
    };
};
/** Guard the strict panel-to-service-worker V3 snapshot request envelope. */
export declare function isV3PanelGetSnapshotRequest(value: unknown): value is V3PanelGetSnapshotRequest;
/** Guard the strict panel-to-service-worker V3 configuration save envelope. */
export declare function isV3PanelSaveConfigRequest(value: unknown): value is V3PanelSaveConfigRequest;
/** Guard either supported V3 panel request. */
export declare function isV3PanelMessage(value: unknown): value is V3PanelMessage;
