export declare const V3_BACKUP_FORMAT: "ajax-proxy-backup";
export declare const V3_BACKUP_VERSION: 3;
export type V3Mode = 'interceptor' | 'redirector';
export type V3Language = 'zh-CN' | 'en';
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export interface V3Tag {
    id: string;
    name: string;
    used: boolean;
}
export interface V3Rule {
    id: string;
    enabled: boolean;
    match: {
        url: string;
        method?: string;
        type?: 'normal' | 'regex';
    };
    request?: {
        enabled: boolean;
        redirect: {
            url: string;
        };
    };
    response?: {
        enabled: boolean;
        replace: {
            status?: number;
            headers?: Record<string, string>;
            body?: JsonValue;
            code?: string;
        };
    };
}
export interface V3Backup {
    format: typeof V3_BACKUP_FORMAT;
    formatVersion: typeof V3_BACKUP_VERSION;
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
