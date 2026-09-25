export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function isValidMode(value: unknown): value is 'interceptor' | 'redirector';
export declare function isValidInterceptors(value: unknown): value is Record<string, unknown>[];
export declare function isValidRedirectors(value: unknown): value is Record<string, unknown>[];
export declare function isValidGlobalState(value: unknown): value is Record<string, unknown>;
