/** Diagnostic event emitted by the page-world V3 request proxy. */
export type V3Hit = {
    kind: 'v3-hit';
    rule_id: string;
    match_url: string;
    method: string;
    url?: string;
};
/** Service-worker notice sent after a V3 rule hit has been recorded. */
export type V3HitNotice = {
    rule_id: string;
    count: number;
    match_url: string;
    method: string;
    url: string;
};
/** Validate the untrusted service-worker hit notice before exposing it to panels. */
export declare function isV3HitNotice(value: unknown): value is V3HitNotice;
/** Validate the untrusted page-world event before forwarding it to extension contexts. */
export declare function isV3Hit(value: unknown): value is V3Hit;
