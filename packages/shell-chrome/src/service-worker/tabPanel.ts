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

async function inspectPanel(path: string) {
  const [windows, tabs] = await Promise.all([
    callChrome<chrome.windows.Window[]>((callback) =>
      chrome.windows.getAll({ windowTypes: ['normal'] }, callback)
    ),
    callChrome<chrome.tabs.Tab[]>((callback) => chrome.tabs.query({}, callback)),
  ])
  const normalWindows = windows.filter(
    (window) => window.type === 'normal' && window.id !== undefined
  )
  const candidates = tabs.filter((tab) => {
    if (tab.id === undefined || !normalWindows.some((window) => window.id === tab.windowId))
      return false
    try {
      const url = new URL(tab.url ?? '')
      url.search = ''
      url.hash = ''
      return url.href === chrome.runtime.getURL(path)
    } catch {
      return false
    }
  })
  const tab = candidates.find((candidate) => candidate.active) ?? candidates[0]
  return {
    windows: normalWindows,
    tab,
    window: normalWindows.find((window) => window.id === tab?.windowId),
  }
}

async function focusTab(tab: chrome.tabs.Tab, window: chrome.windows.Window) {
  if (tab.id === undefined || window.id === undefined)
    throw new Error('Panel tab has no browser window')
  await callChrome<chrome.tabs.Tab | undefined>((callback) =>
    chrome.tabs.update(tab.id!, { active: true }, callback)
  )
  await callChrome<chrome.windows.Window>((callback) =>
    chrome.windows.update(
      window.id!,
      window.state === 'minimized' ? { state: 'normal', focused: true } : { focused: true },
      callback
    )
  )
}

let openQueue: Promise<void> = Promise.resolve()

/**Use a normal browser tab so the V3 panel stays visible within the user's Chrome window. */
export function openTabPanel(path: string, ruleId?: string, action?: PanelAction): Promise<void> {
  const operation = openQueue
    .catch(() => {})
    .then(async () => {
      const existing = await inspectPanel(path)
      if (existing.tab && existing.window) {
        try {
          const needsEditNavigation =
            ruleId && (existing.tab.discarded || existing.tab.status !== 'complete')
          if (needsEditNavigation) {
            await callChrome<chrome.tabs.Tab | undefined>((callback) =>
              chrome.tabs.update(
                existing.tab!.id!,
                { url: panelUrl(path, ruleId, action), active: true },
                callback
              )
            )
          }
          await focusTab(existing.tab, existing.window)
          if (ruleId && !needsEditNavigation) {
            await chrome.runtime
              .sendMessage({
                type: 'ajax-proxy:edit-rule',
                ruleId,
                targetTabId: existing.tab.id,
                ...(action ? { action } : {}),
              })
              .catch(() => {})
          }
          return
        } catch {
          // A tab/window may close between inspection and activation. Create a fresh view.
        }
      }

      const url = panelUrl(path, ruleId, action)
      if (!existing.windows.length) {
        const window = await callChrome<chrome.windows.Window | undefined>((callback) =>
          chrome.windows.create({ url, type: 'normal', focused: true }, callback)
        )
        if (window?.id === undefined)
          throw new Error('Chrome did not create a panel browser window')
        return
      }
      const lastFocused = await callChrome<chrome.windows.Window>((callback) =>
        chrome.windows.getLastFocused({ windowTypes: ['normal'] }, callback)
      ).catch(() => undefined)
      const window =
        existing.windows.find((target) => target.id === lastFocused?.id) ??
        existing.windows.find((target) => target.focused) ??
        existing.windows[0]
      const tab = await callChrome<chrome.tabs.Tab>((callback) =>
        chrome.tabs.create({ url, windowId: window.id, active: true }, callback)
      )
      if (tab?.id === undefined) throw new Error('Chrome did not create the panel tab')
      await focusTab(tab, window)
    })
  openQueue = operation
  return operation
}

export async function closeTabPanel(path: string) {
  const { tab } = await inspectPanel(path)
  if (tab?.id !== undefined) {
    await callChrome<void>((callback) => chrome.tabs.remove(tab.id!, callback))
  }
}

export async function changeTabPanelSize(path: string, fullscreenOnly: boolean) {
  const { tab, window } = await inspectPanel(path)
  if (!tab?.active || window?.id === undefined) return
  const nextState = fullscreenOnly
    ? window.state === 'fullscreen'
      ? 'normal'
      : 'fullscreen'
    : ({ normal: 'maximized', maximized: 'fullscreen', fullscreen: 'normal' } as const)[
        window.state ?? 'normal'
      ]
  if (!nextState) return
  await callChrome<chrome.windows.Window>((callback) =>
    chrome.windows.update(window.id!, { state: nextState }, callback)
  )
}
