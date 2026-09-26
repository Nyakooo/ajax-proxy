export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export interface V3ResponseFunctionResult {
    status?: number;
    headers?: Record<string, string>;
    body?: JsonValue;
}
export interface V3Tag {
    id: string;
    name: string;
    used: boolean;
}
export type V3RedirectConfig = {
    url: string;
    exclusions?: string[];
} | {
    type: 'function';
    code: string;
    exclusions?: string[];
};
export interface V3Rule {
    id: string;
    enabled: boolean;
    /** Optional IDs from the backup's tag collection; omitted means untagged. */
    tagIds?: string[];
    match: {
        url: string;
        method?: string;
        type?: 'normal' | 'regex' | 'exact';
    };
    request?: {
        enabled: boolean;
        redirect: V3RedirectConfig;
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
