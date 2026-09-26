/**storage enums */
export * from './validateState'
export * from './v3Hit'
export * from './v3FunctionError'
export * from './v3NoMatch'
export * from './v3FetchOutcome'

export enum StorageKey {
  LANGUAGE = 'ajax-proxy:storage:language',
  /**全局开关 */
  GLOBAL_SWITCH = 'ajax-proxy:storage:global-switch',
  /**拦截列表 */
  INTERCEPT_LIST = 'ajax-proxy:storage:intercept-list',
  /**重定向列表 */
  REDIRECT_LIST = 'ajax-proxy:storage:redirect-list',
  /**模式 */
  MODE = 'ajax-proxy:storage:mode',
  /**标签 */
  TAGS = 'ajax-proxy:storage:tags',
  /**V3 composite rule configuration */
  V3_CONFIG = 'ajax-proxy:storage:v3-config',
  /**V3 rule hit counters */
  V3_HITS = 'ajax-proxy:storage:v3-hits',
  /** Temporary, one-shot request for a V3 no-match diagnostic */
  V3_DIAGNOSTICS_ARMED = 'ajax-proxy:storage:v3-diagnostics-armed',
  /** Temporary opt-in for correlated V3 Fetch outcome diagnostics */
  V3_FETCH_OUTCOMES_ARMED = 'ajax-proxy:storage:v3-fetch-outcomes-armed',
}

/**通知-去向 */
export enum NoticeTo {
  /**通知 content */
  CONTENT = 'ajax-proxy:notice:to:content',
  /**通知 panels */
  PANELS = 'ajax-proxy:notice:to:panels',
  /**通知 document */
  DOCUMENT = 'ajax-proxy:notice:to:document',
  /**通知 service-worker */
  SERVICE_WORKER = 'ajax-proxy:notice:to:service-worker',
}

/**通知-来自 */
export enum NoticeFrom {
  /**来自 content */
  CONTENT = 'ajax-proxy:notice:from:content',
  /**来自 panels */
  PANELS = 'ajax-proxy:notice:from:panels',
  /**来自 service-worker */
  SERVICE_WORKER = 'ajax-proxy:notice:from:service-worker',
}

/**通知Key */
export enum NoticeKey {
  /**全局开关 */
  GLOBAL_SWITCH = 'ajax-proxy:notice:global-switch',
  /**拦截数据列表 */
  INTERCEPT_LIST = 'ajax-proxy:notice:intercept-list',
  /**重定向列表 */
  REDIRECT_LIST = 'ajax-proxy:notice:redirect-list',
  /**获取当前title */
  GET_CURRENT_TITLE = 'ajax-proxy:notice:get-current-title',
  /**徽章状态 */
  BADGE_STATUS = 'ajax-proxy:notice:badge-status',
  /**命中率 */
  HIT_RATE = 'ajax-proxy:notice:hit-rate',
  /**模式 */
  MODE = 'ajax-proxy:notice:mode',
  /**V3 configuration refresh from content to document */
  V3_CONFIG = 'ajax-proxy:notice:v3-config',
  /**V3 rule hit event */
  V3_HIT = 'ajax-proxy:notice:v3-hit',
  /** Temporary diagnostic capture toggle from content to document */
  V3_DIAGNOSTICS_ARMED = 'ajax-proxy:notice:v3-diagnostics-armed',
  /** Temporary Fetch outcome diagnostic toggle from content to document */
  V3_FETCH_OUTCOMES_ARMED = 'ajax-proxy:notice:v3-fetch-outcomes-armed',
  /**V3 function response execution failure */
  V3_FUNCTION_ERROR = 'ajax-proxy:notice:v3-function-error',
  /** V3 no-match diagnostic, forwarded only while explicitly armed */
  V3_NO_MATCH = 'ajax-proxy:notice:v3-no-match',
  /** Correlated, temporary V3 Fetch outcome diagnostic */
  V3_FETCH_OUTCOME = 'ajax-proxy:notice:v3-fetch-outcome',
}

export * from './v3Panel'
