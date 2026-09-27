declare const __AJAX_PROXY_PANEL_PATH__: string | undefined

import { changeTabPanelSize, closeTabPanel, openTabPanel } from './tabPanel'

let current_window_id: number | undefined
let current_tab_id: number | undefined
let current_tab_window_id: number | undefined
const panelPath =
  typeof __AJAX_PROXY_PANEL_PATH__ === 'undefined' ? 'panels/index.html' : __AJAX_PROXY_PANEL_PATH__

/**获取当前窗口快照，供 service worker 恢复大面板状态。 */
async function getAllWindows(): Promise<chrome.windows.Window[]> {
  return new Promise((resolve, reject) => {
    chrome.windows.getAll(function (targets) {
      const error = chrome.runtime?.lastError
      if (error) {
        reject(new Error(error.message ?? 'Could not inspect browser windows'))
        return
      }
      resolve(targets ?? [])
    })
  })
}

/**聚焦已经打开的视图；如果它最小化了，先恢复到普通窗口。 */
function focusPanelWindow(
  windowId: number,
  state?: chrome.windows.Window['state']
): Promise<boolean> {
  return new Promise((resolve) => {
    const update =
      state === 'minimized' ? { state: 'normal' as const, focused: true } : { focused: true }
    chrome.windows.update(windowId, update, () => {
      resolve(!chrome.runtime?.lastError)
    })
  })
}

/**Open the editor in a tab if Chrome refuses to create a separate window. */
function openPanelTab(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome.tabs?.create) {
      reject(new Error('Chrome tabs API is unavailable'))
      return
    }
    chrome.tabs.create({ url: chrome.runtime.getURL(url), active: true }, (tab) => {
      const error = chrome.runtime?.lastError
      if (error || !tab?.id) {
        reject(new Error(error?.message ?? 'Panel tab could not be created'))
        return
      }
      current_tab_id = tab.id
      current_tab_window_id = tab.windowId
      resolve()
    })
  })
}

/**Focus the fallback tab, returning false if it was closed or is no longer available. */
function focusPanelTab(): Promise<boolean> {
  return new Promise((resolve) => {
    if (current_tab_id === undefined || !chrome.tabs?.update) {
      resolve(false)
      return
    }
    chrome.tabs.update(current_tab_id, { active: true }, (tab) => {
      const error = chrome.runtime?.lastError
      if (error || !tab?.id) {
        resolve(false)
        return
      }
      current_tab_window_id = tab.windowId ?? current_tab_window_id
      if (current_tab_window_id !== undefined) {
        chrome.windows.update(current_tab_window_id, { focused: true }, () => {
          // Activating the tab is sufficient to keep the editor usable even if
          // the platform does not allow focusing its browser window.
          void chrome.runtime?.lastError
        })
      }
      resolve(true)
    })
  })
}

function sendEditRule(ruleId?: string, ruleAction?: 'response' | 'redirect') {
  if (!ruleId) return
  const editMessage: { type: string; ruleId: string; action?: 'response' | 'redirect' } = {
    type: 'ajax-proxy:edit-rule',
    ruleId,
  }
  if (ruleAction) editMessage.action = ruleAction
  return chrome.runtime.sendMessage(editMessage).catch(() => {})
}

/**创建视图 */
export async function createPanel(ruleId?: string, ruleAction?: 'response' | 'redirect') {
  if (panelPath === 'panels-v3/index.html') {
    await openTabPanel(panelPath, ruleId, ruleAction)
    return
  }
  const _createFunc = async function () {
    const params = new URLSearchParams()
    if (ruleId) params.set('edit', ruleId)
    if (ruleAction && ruleId) params.set('action', ruleAction)
    const query = params.toString()
    const url = query ? `${panelPath}?${query}` : panelPath
    try {
      await new Promise<void>((resolve, reject) => {
        const acceptWindow = (target?: chrome.windows.Window, maximizeAfterCreate = false) => {
          const error = chrome.runtime?.lastError
          if (error || !target?.id) {
            reject(new Error(error?.message ?? 'Panel window could not be created'))
            return
          }
          current_window_id = target.id
          if (!maximizeAfterCreate) {
            resolve()
            return
          }
          chrome.windows.update(target.id, { state: 'maximized', focused: true }, () => {
            // The popup is already open. If this browser cannot maximize it,
            // keep the usable window instead of reporting that opening failed.
            void chrome.runtime?.lastError
            resolve()
          })
        }
        chrome.windows.create(
          { url, type: 'popup', state: 'maximized', focused: true },
          (target) => {
            const error = chrome.runtime?.lastError
            if (error || !target?.id) {
              // Some browser builds reject the state on popup creation. Retry
              // with a normal popup, then maximize it after Chrome assigns an ID.
              chrome.windows.create({ url, type: 'popup', focused: true }, (fallbackTarget) =>
                acceptWindow(fallbackTarget, true)
              )
              return
            }
            acceptWindow(target)
          }
        )
      })
      current_tab_id = undefined
      current_tab_window_id = undefined
    } catch (windowError) {
      current_window_id = undefined
      try {
        await openPanelTab(url)
      } catch (tabError) {
        const describe = (error: unknown) =>
          error instanceof Error ? error.message : String(error ?? 'unknown error')
        throw new Error(
          `Window open failed (${describe(windowError)}); tab fallback failed (${describe(tabError)})`,
          { cause: tabError }
        )
      }
    }
  }
  if (current_tab_id !== undefined) {
    if (await focusPanelTab()) {
      await sendEditRule(ruleId, ruleAction)
      return
    }
    current_tab_id = undefined
    current_tab_window_id = undefined
  }
  if (current_window_id) {
    const windows = await getAllWindows()
    const currentPanel = windows.find((item) => item.id === current_window_id)
    if (currentPanel?.id) {
      const focused = await focusPanelWindow(currentPanel.id, currentPanel.state)
      if (!focused) {
        current_window_id = undefined
        await _createFunc()
        return
      }
      await sendEditRule(ruleId, ruleAction)
      return
    }
  }
  // Missing, closed, or un-focusable cached panel: create a fresh view.
  await _createFunc()
}

/**关闭视图 */
export async function closePanel() {
  if (panelPath === 'panels-v3/index.html') return closeTabPanel(panelPath)
  if (current_window_id) {
    chrome.windows.remove(current_window_id)
    current_window_id = undefined
  }
  if (current_tab_id !== undefined) {
    chrome.tabs.remove(current_tab_id)
    current_tab_id = undefined
    current_tab_window_id = undefined
  }
}

/**全屏 */
export async function fullScreenPanel() {
  if (panelPath === 'panels-v3/index.html') return changeTabPanelSize(panelPath, true)
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
  if (panelPath === 'panels-v3/index.html') return changeTabPanelSize(panelPath, false)
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
