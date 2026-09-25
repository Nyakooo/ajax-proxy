// console.log("Ajax proxy content.js")

import {
    initStorage,
    NoticeTo,
    NoticeKey,
    StorageKey,
    noticeDocumentByContent,
    noticeServiceWorkerByContent,
    getStorage,
    getStorageAll,
    setStorage,
    removeStorage,
} from "@proxy/shared-utils";
import { CONNECT_NAME, INIT_CURRENT_TITLE, NOTICE_KEY_REFRESH_GLOBAL_STATE } from "./consts";
import { onLoadForDataConversion } from "@proxy/v2-compatibility";

// 在页面上插入代码
const script = document.createElement("script");
script.setAttribute("type", "text/javascript");
script.setAttribute("src", chrome.runtime.getURL("document.js"));
document.documentElement.appendChild(script);

initStorage().then(() => {
    const { GLOBAL_SWITCH, MODE, INTERCEPT_LIST, REDIRECT_LIST } = StorageKey
    const configKeys = [GLOBAL_SWITCH, MODE, INTERCEPT_LIST, REDIRECT_LIST]
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !configKeys.some(key => Object.prototype.hasOwnProperty.call(changes, key))) return
        const currentState = {
            [GLOBAL_SWITCH]: getStorage(GLOBAL_SWITCH, false),
            [MODE]: getStorage(MODE, 'interceptor'),
            [INTERCEPT_LIST]: getStorage(INTERCEPT_LIST, []),
            [REDIRECT_LIST]: getStorage(REDIRECT_LIST, []),
        }
        noticeDocumentByContent(NOTICE_KEY_REFRESH_GLOBAL_STATE, currentState)
    })

    // 发送当前tab页 title
    noticeServiceWorkerByContent(INIT_CURRENT_TITLE, window.document.title)

    // document.js 资源加载
    script.addEventListener("load", async () => {
        // 获取 全局开关、模式、拦截列表、重定向列表
        const data = await getStorageAll();
        // 新老数据转换
        const { changed, data: getData, changeKeywords } = onLoadForDataConversion(data)
        // 如果有老数据变更新数据，则需要在这里 setStorage
        if (changed) {
            setStorage(StorageKey.GLOBAL_SWITCH, getData.global_on)
            setStorage(StorageKey.MODE, getData.mode)
            setStorage(StorageKey.INTERCEPT_LIST, getData.interceptor_matching_content)
            setStorage(StorageKey.REDIRECT_LIST, getData.redirector_matching_content)
            // 需要清理对应旧数据，不然始终会进到当前判断条件中
            removeStorage(changeKeywords)
        }
        const getGlobalSwtich = getData[StorageKey.GLOBAL_SWITCH] || false
        if (getGlobalSwtich) noticeDocumentByContent(NOTICE_KEY_REFRESH_GLOBAL_STATE, getData)
    });

    // 长链接通信接收 service-worker -> document
    chrome.runtime.connect({ name: CONNECT_NAME });
    // 接收lib 传来的信息 转发给 service-worker
    // 没有from 属性
    window.addEventListener(
        NoticeTo.CONTENT,
        function (event) {
            const customEvent = event as CustomEvent
            // 通知徽章上命中率需要变更
            noticeServiceWorkerByContent(NoticeKey.BADGE_STATUS, customEvent.detail)
        },
        false
    );

}).catch(error => {
    console.error('[AjaxProxy] Content storage initialization failed', error)
})
