import { getRealStorage, StorageKey } from "@proxy/shared-utils";
import { chromeBadge } from "./badge";

/**设置默认项 */
export async function initDefaultSth() {
    // 设置默认icon
    const bool = await getRealStorage(StorageKey.GLOBAL_SWITCH, false)
    if (bool) chrome.action.setIcon({ path: "icons/128.png" });
    else chrome.action.setIcon({ path: "icons/128g.png" });

    // 初始化徽章状态
    chromeBadge()
}