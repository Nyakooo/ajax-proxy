/**请求协议 */
export type IRequestMethod = "ANY" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
/**规则 */
export type IFilterType = "normal" | "regex";
/**模式 */
export type IMode = "interceptor" | "redirector"
/**全局状态结构体 */
export type RefGlobalState<T = IGlobalState> = { value: T }
/**响应式类型 */
export type OverrideType = 'json' | 'function'
/**重定向类型 */
export type RedirectType = 'text' | 'function'

type CommonContent = {
    /**是否需要匹配 */
    switch_on: boolean;
    /**匹配规则 */
    filter_type?: IFilterType
    /**请求协议 */
    method?: IRequestMethod
    /**备注 */
    remark?: string;
}

/**拦截器对象 */
export type IMatchInterceptorContent = {
    /**匹配目标URL */
    match_url: string;
    /**需要覆盖的内容 */
    override?: string;
    /**命中率 */
    hit?: number;
    /**状态码 */
    status_code?: string
    /**响应式类型 */
    override_type?: OverrideType
    /**函数响应 */
    override_func?: string
} & CommonContent

/**重定向头部结构体 */
export type IRedirectHeader = {
    key: string
    value: string
    description?: string
}

/**重定向对象结构体 */
export type IMatchRedirectContent = {
    /**域名 */
    domain: string
    /**重定向地址 */
    redirect_url: string
    /**请求头 */
    headers?: IRedirectHeader[]
    /**忽略名单 */
    ignores?: string[]
    /**重定向类型 */
    redirect_type?: RedirectType
    /**函数响应 */
    redirect_func?: string
} & CommonContent

export type IGlobalState = {
    /**全局开关 */
    global_on: boolean;
    /**模式 */
    mode: IMode;
    /**拦截规则列表 */
    interceptor_matching_content: IMatchInterceptorContent[];
    /**重定向规则列表 */
    redirector_matching_content: IMatchRedirectContent[];
}
