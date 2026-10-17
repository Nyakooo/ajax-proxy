/// <reference types="chrome" />
import { NoticeKey } from "./consts";
/**
 * 通知 content -> document
 */
export declare function noticeDocumentByContent(key: NoticeKey | string, value: any): void;
/**
 * 通知 content -> service-worker
 * @param key
 * @param value
 */
export declare function noticeServiceWorkerByContent(key: NoticeKey | string, value: any): void;
/**
 * 通知 panels -> service-worker
 */
export declare function noticeServiceWorkerByPanels(key: any, value: any): void;
/**
 * 通知 service-worker -> panels
 */
export declare function noticePanelsByServiceWorker(key: NoticeKey, value?: any): void;
/** service-worker 长链接监听 */
export declare function onConnectByServiceWorker(onConnectFn: (port: chrome.runtime.Port) => void, onDisconnectFn: () => void): void;
/**
 * 通知 service-worker -> content
 */
export declare function noticeContentByServiceWorker(port: chrome.runtime.Port | undefined, key: NoticeKey, value: any): void;
/**
 * 当前活动页签发生改变
 */
export declare function onCurrentTabChanged(callback: (tab: chrome.tabs.Tab) => void): void;
