export type PanelScreen = { left: number; top: number; width: number; height: number }
type PanelAction = 'response' | 'redirect'

function callChrome<T>(run: (callback: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    run((value) => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message ?? 'Chrome panel operation failed'))
      else resolve(value)
    })
  })
}

function panelUrl(path: string, ruleId?: string, action?: PanelAction) {
  const url = new URL(chrome.runtime.getURL(path))
  if (ruleId) url.searchParams.set('edit', ruleId)
  if (ruleId && action) url.searchParams.set('action', action)
  return url.href
}

function isPanelTab(tab: chrome.tabs.Tab, path: string) {
  if (tab.id === undefined) return false
  try {
    const url = new URL(tab.url ?? '')
    url.search = ''
    url.hash = ''
    return url.href === chrome.runtime.getURL(path)
  } catch {
    return false
  }
}

async function inspectPanel(path: string) {
  const [windows, tabs] = await Promise.all([
    callChrome<chrome.windows.Window[]>((callback) =>
      chrome.windows.getAll({ windowTypes: ['normal', 'popup'] }, callback)
    ),
    callChrome<chrome.tabs.Tab[]>((callback) => chrome.tabs.query({}, callback)),
  ])
  const panels = windows.filter(
    (window) =>
      window.type === 'popup' &&
      window.id !== undefined &&
      tabs.some((tab) => tab.windowId === window.id && isPanelTab(tab, path))
  )
  const window = panels.find((candidate) => candidate.focused) ?? panels[0]
  const tab = window
    ? tabs.find((candidate) => candidate.windowId === window.id && isPanelTab(candidate, path))
    : undefined
  return { windows, window, tab }
}

async function panelBounds(windows: chrome.windows.Window[], screen?: PanelScreen) {
  if (!screen) {
    const lastFocused = await callChrome<chrome.windows.Window>((callback) =>
      chrome.windows.getLastFocused({ windowTypes: ['normal'] }, callback)
    ).catch(() => undefined)
    const reference =
      windows.find((window) => window.type === 'normal' && window.id === lastFocused?.id) ??
      windows.find((window) => window.type === 'normal' && window.focused) ??
      windows.find((window) => window.type === 'normal')
    screen = {
      left: reference?.left ?? 0,
      top: reference?.top ?? 0,
      width: reference?.width ?? 1280,
      height: reference?.height ?? 900,
    }
  }
  const width = Math.max(1, Math.min(1280, screen.width - 32))
  const height = Math.max(1, Math.min(900, screen.height - 32))
  return {
    left: Math.round(screen.left + (screen.width - width) / 2),
    top: Math.round(screen.top + (screen.height - height) / 2),
    width,
    height,
  }
}

let openQueue: Promise<void> = Promise.resolve()

/** Keep the editor in its own visible window, separate from browser tabs. */
export function openPopupPanel(
  path: string,
  ruleId?: string,
  action?: PanelAction,
  screen?: PanelScreen
): Promise<void> {
  const operation = openQueue
    .catch(() => {})
    .then(async () => {
      const existing = await inspectPanel(path)
      const bounds = await panelBounds(existing.windows, screen)
      if (existing.window?.id !== undefined && existing.tab?.id !== undefined) {
        const needsEditNavigation =
          ruleId && (existing.tab.discarded || existing.tab.status !== 'complete')
        await callChrome<chrome.tabs.Tab | undefined>((callback) =>
          chrome.tabs.update(
            existing.tab!.id!,
            needsEditNavigation
              ? { url: panelUrl(path, ruleId, action), active: true }
              : { active: true },
            callback
          )
        )
        // Restore first, then apply bounds: geometry updates are invalid in fullscreen/maximized states.
        await callChrome<chrome.windows.Window>((callback) =>
          chrome.windows.update(existing.window!.id!, { state: 'normal', focused: true }, callback)
        )
        await callChrome<chrome.windows.Window>((callback) =>
          chrome.windows.update(existing.window!.id!, { ...bounds, focused: true }, callback)
        )
        if (ruleId && !needsEditNavigation) {
          await chrome.runtime.sendMessage({
            type: 'ajax-proxy:edit-rule',
            ruleId,
            targetTabId: existing.tab.id,
            ...(action ? { action } : {}),
          })
        }
        return
      }
      const window = await callChrome<chrome.windows.Window | undefined>((callback) =>
        chrome.windows.create(
          {
            url: panelUrl(path, ruleId, action),
            type: 'popup',
            state: 'normal',
            focused: true,
            ...bounds,
          },
          callback
        )
      )
      if (window?.id === undefined) throw new Error('Chrome did not create the panel popup window')
      await callChrome<chrome.windows.Window>((callback) =>
        chrome.windows.update(window.id!, { focused: true }, callback)
      )
    })
  openQueue = operation
  return operation
}

export async function closePopupPanel(path: string): Promise<boolean> {
  const { window } = await inspectPanel(path)
  if (window?.id === undefined || !window.focused) return false
  await callChrome<void>((callback) => chrome.windows.remove(window.id!, callback))
  return true
}

export async function changePopupPanelSize(
  path: string,
  fullscreenOnly: boolean
): Promise<boolean> {
  const { window } = await inspectPanel(path)
  if (window?.id === undefined || !window.focused) return false
  const nextState = fullscreenOnly
    ? window.state === 'fullscreen'
      ? 'normal'
      : 'fullscreen'
    : ({ normal: 'maximized', maximized: 'fullscreen', fullscreen: 'normal' } as const)[
        window.state ?? 'normal'
      ]
  if (!nextState) return false
  await callChrome<chrome.windows.Window>((callback) =>
    chrome.windows.update(window.id!, { state: nextState }, callback)
  )
  return true
}
