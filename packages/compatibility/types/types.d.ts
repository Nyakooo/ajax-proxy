import { IFilterType, IGlobalState, IMatchInterceptorContent, IMatchRedirectContent, IMode, IRedirectHeader, IRequestMethod } from "@proxy/lib/types/types";
/**
 * 标签结构体
 * 新老数据没变化
 * {id: "633f895c49960dd6iuyz3s3t", name: "asdf", used: false}
 *  */
declare type TagStruct = {
    id: string;
    name: string;
    used: boolean;
};
declare type OldCommonStruct = {
    id: string;
    /**是否需要匹配 */
    switchOn: boolean;
    /**匹配规则 */
    filterType: IFilterType;
    /**请求协议 */
    method?: IRequestMethod;
    /**备注 */
    remark?: string;
};
/**老数据- 拦截列表 */
export declare type OldInterceptorStruct = {
    /**匹配目标URL */
    match: string;
    /**标签id */
    tagId?: TagStruct['id'];
    /**状态码 */
    statusCode?: string;
    /**命中率 */
    hit?: number;
    /**需要覆盖的内容 */
    override?: string;
} & OldCommonStruct;
/**老数据- 重定向列表 */
export declare type OldRedirectorStruct = {
    /**域名 */
    domain: string;
    /**重定向地址 */
    redirect: string;
    /**请求头 */
    headers?: IRedirectHeader[];
    /**忽略名单 */
    whitelist?: string[];
} & OldCommonStruct;
/**
 * 老数据 GlobalState 结构体
 */
export declare type OldGLobalStateStruct = {
    /**全局开关 */
    globalSwitchOn: boolean;
    /**模式 */
    mode: IMode;
    /**拦截规则列表 */
    proxy_routes?: OldInterceptorStruct[];
    /**重定向规则列表 */
    redirect?: OldRedirectorStruct[];
};
/**
 * 旧数据 key 值映射
 */
export declare type MappingOldKeys = (keyof OldGLobalStateStruct)[];
/**
 * 新GlobalState数据结构体
 */
export declare type NewGLobalStateStruct = IGlobalState & {
    /**拦截规则列表 */
    interceptor_matching_content?: (IMatchInterceptorContent & {
        id: string;
        tagId?: TagStruct['id'];
    })[];
    redirector_matching_content?: (IMatchRedirectContent & {
        id: string;
    })[];
};
/**
 * 上传 - 老数据格式
 */
export declare type OldUploadStruct = {
    /**语言 */
    lang: string;
    /**拦截规则列表 */
    proxy_routes?: OldInterceptorStruct[];
    /**重定向规则列表 */
    redirect?: OldRedirectorStruct[];
    /**模式 */
    mode: IMode;
    /**标签 */
    tags?: TagStruct[];
};
/**
 * 上传 - 新数据格式
 */
export declare type NewUploadStruct = {
    language: string;
    mode: IMode;
    tags: TagStruct[];
    interceptors?: (IMatchInterceptorContent & {
        id: string;
        tagId?: TagStruct['id'];
    })[];
    redirectors?: (IMatchRedirectContent & {
        id: string;
    })[];
};
export {};
