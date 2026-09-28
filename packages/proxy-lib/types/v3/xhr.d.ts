import type { V3RuntimeHostOptions } from './runtimeOptions';
export type V3XHROptions = V3RuntimeHostOptions;
export type V3XHRConstructor = new () => XMLHttpRequest;
/**
 * Create an isolated XMLHttpRequest prototype for V3 rules.
 * It does not patch the global constructor; the extension host owns mounting and state.
 * Native events and response headers remain browser-owned and are not rewritten.
 */
export declare function createV3XHR(NativeXHR: V3XHRConstructor, options: V3XHROptions): V3XHRConstructor;
