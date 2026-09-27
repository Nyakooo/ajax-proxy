/** Normalize an absolute HTTP(S) URL to its exact origin. */
export declare function normalizeV3Origin(value: unknown): string | null;
/** Check whether an exact HTTP(S) origin is present in a disabled-origin list. */
export declare function isV3OriginDisabled(origin: string, disabledOrigins: readonly string[]): boolean;
