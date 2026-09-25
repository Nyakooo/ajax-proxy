import type { V3Rule } from '@proxy/v3-domain';
export interface V3RuntimeHostOptions {
    getRules: () => readonly V3Rule[];
    onMatched?: (rule: V3Rule, index: number, request: {
        url: string;
        method: string;
    }) => void;
}
