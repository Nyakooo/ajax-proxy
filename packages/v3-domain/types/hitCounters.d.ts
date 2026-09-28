import type { V3Hit } from '@proxy/protocol';
import type { V3Backup } from './backup';
export type V3HitCounters = Record<string, number>;
/** Keep only safe, non-negative counters for rules in the validated backup. */
export declare function sanitizeV3HitCounters(value: unknown, backup: V3Backup): V3HitCounters;
/** Sum valid counters belonging to rules in the backup. */
export declare function getV3HitTotal(value: unknown, backup: V3Backup): number;
/** Revalidate a hit against the active backup and produce the cleaned next counters. */
export declare function recordV3Hit(backup: V3Backup, countersValue: unknown, hit: V3Hit): {
    counters: V3HitCounters;
    count: number;
} | undefined;
