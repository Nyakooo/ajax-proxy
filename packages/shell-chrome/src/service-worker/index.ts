
// console.log("Ajax proxy service_worker.js")

import {
    NoticeFrom,
    NoticeTo,
    NoticeKey,
    initStorage,
    noticePanelsByServiceWorker,
} from "@proxy/shared-utils";
import { injectEventListener } from "./event";
import { noticeContent, useCurrentTitle } from "./notice";
import { initDefaultSth } from "./init";
import { chromeBadge } from "./badge";
import { INIT_CURRENT_TITLE } from "../consts";

initStorage().then(() => {
    // 接收content 和 panels 传来的信息
    chrome.runtime.onMessage.addListener((msg) => {

        if (msg.to === NoticeTo.SERVICE_WORKER) {
            const { key, value } = msg
            // 徽章
            if ([NoticeFrom.CONTENT, NoticeFrom.PANELS].includes(msg.from)) {
                // 当 panels 清空某个命中统计时
                // 重新统计一下全局命中率
                if (key === NoticeKey.BADGE_STATUS) chromeBadge(value)
            }

            if (msg.from === NoticeFrom.PANELS) {
                // 判断启用状态
                if (key === NoticeKey.GLOBAL_SWITCH) {
                    chrome.action.setIcon({
                        path: value ? "icons/128.png" : "icons/128g.png",
                    });
                    // 更新一下图标状态
                    chromeBadge()
                    noticeContent(key, value)
                }
                // 模式切换
                if (key === NoticeKey.MODE) {
                    chromeBadge();
                    noticeContent(key, value)
                }
                // 拦截器列表
                if (key === NoticeKey.INTERCEPT_LIST) {
                    chromeBadge();
                    noticeContent(key, value)
                }
                // 重定向列表
                if (key === NoticeKey.REDIRECT_LIST) {
                    noticeContent(key, value)
                }
                // 获取当前document.title [被动]
                // panels -> service-worker -> connect.port.sender.tab.title -> panels
                if (key === NoticeKey.GET_CURRENT_TITLE) {
                    const title = useCurrentTitle()
                    noticePanelsByServiceWorker(NoticeKey.GET_CURRENT_TITLE, title)
                }
            } else if (msg.from === NoticeFrom.CONTENT) {
                // content -> service-worker -> panels
                // 页面加载初始化当前title [主动]
                if (key === INIT_CURRENT_TITLE) {
                    // 接收content转发给panels
                    noticePanelsByServiceWorker(NoticeKey.GET_CURRENT_TITLE, value)
                }
            }
        }
    });

    // 设置默认项
    initDefaultSth()

    // 注册其他监听列表
    injectEventListener()
})
