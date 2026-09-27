import { getRealStorage, StorageKey } from "@proxy/shared-utils";
import { validateV3Backup } from "@proxy/v3-domain";
import { chromeBadge } from "./badge";

/** V3 owns the global switch when a valid V3 configuration exists. */
export async function syncToolbarIcon() {
    const rawConfig = await getRealStorage(StorageKey.V3_CONFIG, null)
    const validation = rawConfig === null ? null : validateV3Backup(rawConfig)
    const enabled = validation?.ok
        ? validation.data.settings.globalEnabled
        : await getRealStorage(StorageKey.GLOBAL_SWITCH, false)
    chrome.action.setIcon({ path: enabled ? "icons/128.png" : "icons/128g.png" });
}

/**设置默认项 */
export async function initDefaultSth() {
    await syncToolbarIcon()

    // 初始化徽章状态
    chromeBadge()
}
