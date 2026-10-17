import {
    NoticeKey,
    onConnectByServiceWorker,
    noticePanelsByServiceWorker,
    noticeContentByServiceWorker,
    onCurrentTabChanged
} from "@proxy/shared-utils";
import { CONNECT_NAME } from "../consts";
import { createPanel } from "./panel";

/**
 * 可以定义多对多，但考虑此工具无需多个链接。
 * 多对多方式:
 *  current_port = {}
 *  ...
 *  current_port[tabId].postMessage()
 */
let current_port: chrome.runtime.Port | undefined = undefined;

// 长链接
// 好处是可以实现无刷新更新拦截器代理
// 弊端是每一个新的tab页都会更新current_port，旧的长链会注销
onConnectByServiceWorker((port) => {
    if (port.name === CONNECT_NAME) {
        current_port = port
    }
}, () => {
    // 长链接断开
    current_port = undefined
    // 通知 panels 清空 title
    noticePanelsByServiceWorker(NoticeKey.GET_CURRENT_TITLE, "")
})

// 当页签发生改变时，通知panels 变更title
onCurrentTabChanged((tab) => {
    noticePanelsByServiceWorker(NoticeKey.GET_CURRENT_TITLE, tab.title)
})

/**
 * 通知 content
 */
export const noticeContent = (key, value) => noticeContentByServiceWorker(current_port, key, value)

/**获取 port里 title */
export function useCurrentTitle() {
    return current_port?.sender?.tab?.title
}

/**
 * 系统通知
 * 当命中率过高时
 */
export function chromeNativeNotice({ title, message }) {
    const notification = new Notification(title, {
        icon: "icons/128.png",
        body: message,
    });
    notification.onclick = function () {
        createPanel();
        notification.close();
    };
}