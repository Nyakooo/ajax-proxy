import { IMatchInterceptorContent, IMatchRedirectContent } from "./types";
export declare function maybeMatching(url: string, match: string, type?: IMatchInterceptorContent['filter_type']): boolean;
/**
 * 规则过滤
 * 域名判断
 * 规则类型判断
 * 忽略列表判断
 */
export declare function matchIgnoresAndRule(url: string, match: string, type: import("./types").IFilterType | undefined, ignores: IMatchRedirectContent['ignores']): boolean;
/**格式化URL 返回 string */
export declare function fmtURLToString(url: string | URL): string;
/**获取重定向URL */
export declare function finalRedirectUrl(url: string, match: string, redirect_url: string, type?: IMatchRedirectContent['filter_type']): string;
export declare function notice(url: string, match_url: string, method: string): void;
export declare const warn: (...args: any[]) => void;
