
import { noticeServiceWorkerByPanels, NoticeKey } from "@proxy/shared-utils";

/**通知 */
export const useNotice = {
    /**全局开关 */
    globalSwitchOn: (value) => noticeServiceWorkerByPanels(NoticeKey.GLOBAL_SWITCH, value),
    /**同步拦截路由列表 */
    changeIntercepts: (routes) => noticeServiceWorkerByPanels(NoticeKey.INTERCEPT_LIST, routes),
    /**通知徽章上命中率需要变更 */
    changeBadge: () => noticeServiceWorkerByPanels(NoticeKey.BADGE_STATUS, null),
    /**同步给 @proxy/lib 模式 */
    changeMode: (value) => noticeServiceWorkerByPanels(NoticeKey.MODE, value),
    /**同步给 @proxy/lib 重定向列表 */
    changeRedirects: (value) => noticeServiceWorkerByPanels(NoticeKey.REDIRECT_LIST, value),
    /**获取当前title */
    getCurrentTitle: () => noticeServiceWorkerByPanels(NoticeKey.GET_CURRENT_TITLE),
}