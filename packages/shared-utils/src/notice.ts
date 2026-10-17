import { useRuntime } from "./env";
import { NoticeFrom, NoticeTo, NoticeKey } from "./consts";

/**
 * 通知 content -> document
 */
export function noticeDocumentByContent(key: NoticeKey | string, value) {
    window.postMessage({
        from: NoticeFrom.CONTENT,
        to: NoticeTo.DOCUMENT,
        key,
        value,
    });
}

/**
 * 通知 content -> service-worker
 * @param key
 * @param value
 */
export function noticeServiceWorkerByContent(key: NoticeKey | string, value) {
    if (useRuntime) {
        chrome.runtime.sendMessage({
            from: NoticeFrom.CONTENT,
            to: NoticeTo.SERVICE_WORKER,
            key,
            value,
        }).catch(err => {
            // 离线状态 或 网页未加载成功情况下，content_script 未加载，导致没有接收方
            // 会导致：Error: Could not establish connection. Receiving end does not exist.
        });
    }
}

/**
 * 通知 panels -> service-worker
 */
export function noticeServiceWorkerByPanels(key, value) {
    if (useRuntime) {
        chrome.runtime.sendMessage(chrome.runtime.id, {
            from: NoticeFrom.PANELS,
            to: NoticeTo.SERVICE_WORKER,
            key, value
        }).catch(err => {
            // 离线状态 或 网页未加载成功情况下，content_script 未加载，导致没有接收方
            // 会导致：Error: Could not establish connection. Receiving end does not exist.
        });
    }
}

/**
 * 通知 service-worker -> panels
 */
export function noticePanelsByServiceWorker(key: NoticeKey, value?: any) {
    if (useRuntime) {
        chrome.runtime.sendMessage({
            from: NoticeFrom.SERVICE_WORKER,
            to: NoticeTo.PANELS,
            key, value
        }).catch(err => { })
    }
}

/** service-worker 长链接监听 */
export function onConnectByServiceWorker(
    onConnectFn: (port: chrome.runtime.Port) => void,
    onDisconnectFn: () => void,
) {
    // 长链接
    // 好处是可以实现无刷新更新拦截器代理
    // 弊端是每一个新的tab页都会更新current_port，旧的长链会注销
    chrome.runtime.onConnect.addListener((port) => {
        onConnectFn(port)
        // 监听长链接 被断开
        port.onDisconnect.addListener(() => onDisconnectFn())
    })
}


/**
 * 通知 service-worker -> content
 */
export function noticeContentByServiceWorker(port: chrome.runtime.Port | undefined, key: NoticeKey, value) {
    if (port) {
        try {
            port.postMessage({
                from: NoticeFrom.SERVICE_WORKER,
                to: NoticeTo.CONTENT,
                key, value
            })
        } catch (error) {
            // catch err
            // error: Error: Attempting to use a disconnected port object
            // 当被操作页被关闭掉，而在操作面板上继续操作时，此时port通信断开，报异常
            // 一般不会走到这里，上有已经做 onDisconnect 监听
        }
    }
}

/**
 * 当前活动页签发生改变
 */
export function onCurrentTabChanged(callback: (tab: chrome.tabs.Tab) => void) {
    chrome.tabs.onActivated.addListener(activeInfo => {
        chrome.tabs.get(activeInfo.tabId)
            .then(getTab => {
                // 判断是否为一个正常的页签
                if (getTab.url?.startsWith("http") || getTab.url?.startsWith("https")) callback(getTab)
                // title 置空
                else callback({ ...getTab, title: "" })
            })
            .catch(err => { })
    })
}
