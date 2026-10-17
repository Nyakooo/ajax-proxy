/**storage enums */
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
  SERVICE_WORKER = 'ajax-proxy:notice:to:service-worker'
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
  GET_CURRENT_TITLE = "ajax-proxy:notice:get-current-title",
  /**徽章状态 */
  BADGE_STATUS = 'ajax-proxy:notice:badge-status',
  /**命中率 */
  HIT_RATE = 'ajax-proxy:notice:hit-rate',
  /**模式 */
  MODE = 'ajax-proxy:notice:mode',
}
