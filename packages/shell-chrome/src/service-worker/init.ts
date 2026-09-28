import { getRealStorage, StorageKey } from '@proxy/shared-utils'
import { validateV3Backup } from '@proxy/v3-domain'
import { chromeBadge } from './badge'

/** Keep the toolbar icon aligned with the V3 UI's enabled empty-config default. */
export async function syncToolbarIcon() {
  const rawConfig = await getRealStorage(StorageKey.V3_CONFIG, null)
  const validation = rawConfig === null ? null : validateV3Backup(rawConfig)
  const enabled =
    rawConfig === null
      ? true
      : validation?.ok
        ? validation.data.settings.globalEnabled
        : await getRealStorage(StorageKey.GLOBAL_SWITCH, false)
  chrome.action.setIcon({ path: enabled ? 'icons/128.png' : 'icons/128g.png' })
}

/**设置默认项 */
export async function initDefaultSth() {
  await syncToolbarIcon()

  // 初始化徽章状态
  chromeBadge()
}
