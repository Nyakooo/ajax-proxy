import { V3_BACKUP_LEGACY_VERSION, V3_BACKUP_VERSION } from './backupVersion';
import type { V3ResponseFunctionResult, V3Rule, V3Tag } from './rules';
export declare const V3_BACKUP_FORMAT: "ajax-proxy-backup";
export { V3_BACKUP_LEGACY_VERSION, V3_BACKUP_VERSION };
export declare const V3_BACKUP_MAX_BYTES: number;
export declare const V3_FUNCTION_RESULT_MAX_BYTES: number;
export type V3Mode = 'interceptor' | 'redirector';
export type V3Language = 'zh-CN' | 'en';
export interface V3Backup {
    format: typeof V3_BACKUP_FORMAT;
    formatVersion: typeof V3_BACKUP_VERSION | typeof V3_BACKUP_LEGACY_VERSION;
    settings: {
        globalEnabled: boolean;
        mode: V3Mode;
        language: V3Language;
    };
    tags: V3Tag[];
    rules: V3Rule[];
}
export interface V3ValidationIssue {
    path: string;
    message: string;
}
export type V3BackupValidation = {
    ok: true;
    data: V3Backup;
} | {
    ok: false;
    issues: V3ValidationIssue[];
};
export type V3BackupParseResult = {
    ok: true;
    data: V3Backup;
    warnings: V3ValidationIssue[];
} | {
    ok: false;
    issues: V3ValidationIssue[];
};
export declare function validateV3Backup(value: unknown): V3BackupValidation;
export declare function parseV3BackupJson(text: string): V3BackupParseResult;
export declare function formatV3ValidationIssues(issues: V3ValidationIssue[]): string[];
/** Validate and clone the JSON-only result returned by a V3 response function. */
export declare function validateV3ResponseFunctionResult(value: unknown): {
    ok: true;
    data: V3ResponseFunctionResult;
} | {
    ok: false;
    issue: string;
};
