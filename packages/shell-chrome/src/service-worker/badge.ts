
// 和徽章相关的函数

import { IRequestMethod } from "@proxy/lib";
import { NoticeKey, StorageKey, setStorage, getRealStorage, noticePanelsByServiceWorker } from "@proxy/shared-utils";
import { chromeNativeNotice } from "./notice";

// 同步 命中率
async function syncRoutesAsHit(routes, match_url, method) {
    const list = routes || [];
    // 总命中率
    let counter = 0;
    for (let i = 0; i < list.length; i++) {
        const target = list[i];
        if (target.switch_on) {
            // target 可能没有 method 属性时，设置默认值
            const targetMethod = target.method || "ANY"
            // 如果match_url 和method 匹配 则叠加当前命中率
            if (
                target.match_url === match_url &&
                (targetMethod === "ANY" || targetMethod === method)
            ) {
                const totalHit = target.hit ? target.hit + 1 : 1;
                target.hit = totalHit;
                counter += totalHit;

                // 这里开始统计某个接口命中次数是否存在过多
                const LIMIT = 100;
                // 命中次数 太多，通知一下
                let tooHigh = totalHit === LIMIT;
                // 每隔20次提醒一下
                if (!tooHigh && totalHit > LIMIT) {
                    tooHigh = (totalHit - LIMIT) % 20 === 0;
                }
                if (tooHigh) {
                    const message = [target.match_url, target.remark || ""].join("\n");
                    const lang = await getRealStorage(StorageKey.LANGUAGE, "en");
                    const i18n = {
                        en: "Too many interceptions",
                        zh: "拦截次数过多",
                    };
                    chromeNativeNotice({
                        title: i18n[lang] || i18n.en,
                        message,
                    });
                }
            } else if (target.hit) {
                // 汇总其他match_url上 hit
                counter += target.hit;
            }
        }
    }
    // 更新本地拦截列表
    setStorage(StorageKey.INTERCEPT_LIST, list);
    return counter;
}

/**当前命中数据的结构体 */
type BadgeHit = {
    match_url: string
    method: IRequestMethod
}
// badge 右下角小徽章设置
export async function chromeBadge(data?: BadgeHit) {
    const { match_url, method } = data || {}
    const globalSwitchOn = await getRealStorage(StorageKey.GLOBAL_SWITCH, false);
    if (!globalSwitchOn) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }
    // 判断模式
    const mode = await getRealStorage(StorageKey.MODE, 'interceptor');
    // 如果是重定向
    if (mode === "redirector") {
        chrome.action.setBadgeBackgroundColor({ color: "#006d75" });
        chrome.action.setBadgeText({ text: "R" });
        return;
    }
    // 拦截器模式颜色
    chrome.action.setBadgeBackgroundColor({ color: "#F56C6C" });
    const interceptList = await getRealStorage(StorageKey.INTERCEPT_LIST, []);
    // 如果没有需要拦截的数据时，设置默认值
    if (interceptList.length === 0) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }

    const counter = await syncRoutesAsHit(interceptList, match_url, method)
    // 当计算完成，且 参数存在时证明 hit 属性已经做过叠加，需要通知到 panels变更列表 hit 数据
    if (match_url && method) {
        // 通知 panels 当前 match_url & method 的条件下已经命中，hit 属性已经变更 需要更新table 列表
        noticePanelsByServiceWorker(NoticeKey.HIT_RATE)
    }
    if (counter) chrome.action.setBadgeText({ text: `+${counter}` });
    else chrome.action.setBadgeText({ text: "" });
}