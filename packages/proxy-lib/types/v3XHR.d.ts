import type { V3Rule } from '@proxy/v3-domain';
export interface V3XHROptions {
    getRules: () => readonly V3Rule[];
    onMatched?: (rule: V3Rule, index: number) => void;
}
export type V3XHRConstructor = new () => XMLHttpRequest;
/**
 * Create an isolated XMLHttpRequest prototype for V3 rules.
 * It does not patch the global constructor or participate in extension runtime state.
 * Native events and response headers remain browser-owned and are not rewritten.
 */
export declare function createV3XHR(NativeXHR: V3XHRConstructor, options: V3XHROptions): V3XHRConstructor;
