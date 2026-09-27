declare const __AJAX_PROXY_PANEL_PATH__: string | undefined

let current_window_id: number | undefined
const panelPath =
  typeof __AJAX_PROXY_PANEL_PATH__ === 'undefined' ? 'panels/index.html' : __AJAX_PROXY_PANEL_PATH__

/**获取所有windowId */
async function getAllWindowIds(): Promise<(number | undefined)[]> {
  return new Promise((resolve) => {
    chrome.windows.getAll(function (targets) {
      const ids = targets.map((item) => item.id)
      resolve(ids)
    })
  })
}

/**创建视图 */
export async function createPanel(ruleId?: string) {
  const _createFunc = function () {
    return new Promise<void>((resolve, reject) => {
      const url = ruleId ? `${panelPath}?edit=${encodeURIComponent(ruleId)}` : panelPath
      const acceptWindow = (target?: chrome.windows.Window) => {
        const error = chrome.runtime?.lastError
        if (error || !target?.id) {
          reject(new Error(error?.message ?? 'Panel window could not be created'))
          return
        }
        current_window_id = target.id
        resolve()
      }
      chrome.windows.create(
        { url, type: 'popup', width: 1300, height: 750, top: 30, left: 150 },
        (target) => {
          const error = chrome.runtime?.lastError
          // Small screens may reject fixed bounds. Let Chrome choose
          // visible bounds rather than preventing the editor opening.
          if (error?.message?.includes('bounds')) {
            chrome.windows.create({ url, type: 'popup' }, acceptWindow)
            return
          }
          acceptWindow(target)
        }
      )
    })
  }
  if (!current_window_id) {
    await _createFunc()
  } else {
    // 获取所有窗口id，判断cacheId是否存在
    // 如果已经存在则置前
    const ids = await getAllWindowIds()
    const exist = ids.some((item) => item === current_window_id)
    if (exist) {
      chrome.windows.update(current_window_id, { focused: true })
      if (ruleId) {
        await chrome.runtime.sendMessage({ type: 'ajax-proxy:edit-rule', ruleId }).catch(() => {})
      }
      return
    }
    // 不存在，则重新创建，刷新cacheId
    await _createFunc()
  }
}

/**关闭视图 */
export async function closePanel() {
  if (current_window_id) {
    chrome.windows.remove(current_window_id)
    current_window_id = undefined
  }
}

/**全屏 */
export async function fullScreenPanel() {
  if (current_window_id) {
    chrome.windows.getCurrent(function (current) {
      if (current.id && current.id === current_window_id) {
        switch (current.state) {
          case 'fullscreen':
            chrome.windows.update(current.id, { state: 'normal' })
            break
          default:
            chrome.windows.update(current.id, { state: 'fullscreen' })
            break
        }
      }
    })
  }
}

/**修改 panels 窗口大小 */
export async function resizeWindow() {
  if (current_window_id) {
    chrome.windows.getCurrent(function (current) {
      // normal", "minimized", "maximized", or "fullscreen"
      const conf = {
        normal: 'maximized',
        maximized: 'fullscreen',
        fullscreen: 'normal',
      }
      const nextState = current.state ? conf[current.state] : undefined
      if (current.id && current.id === current_window_id && nextState)
        chrome.windows.update(current.id, { state: nextState })
    })
  }
}
