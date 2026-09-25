/** Diagnostic event emitted by the page-world V3 request proxy. */
export type V3Hit = {
    kind: 'v3-hit';
    rule_id: string;
    match_url: string;
    method: string;
    url?: string;
};
/** Validate the untrusted page-world event before forwarding it to extension contexts. */
export declare function isV3Hit(value: unknown): value is V3Hit;
