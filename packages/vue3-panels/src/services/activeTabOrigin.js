function normalizeSiteOrigin(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : ''
  } catch {
    return ''
  }
}

export function createActiveTabOriginService(tabs = globalThis.chrome?.tabs) {
  return {
    subscribe(listener) {
      if (!tabs?.query) return () => {}

      let active = true
      const refresh = async () => {
        let origin = ''
        try {
          const currentTabs = await tabs.query({ active: true, lastFocusedWindow: true })
          origin = normalizeSiteOrigin(currentTabs?.[0]?.url)
        } catch {
          // A restricted or unavailable active tab has no displayable origin.
        }
        if (active) listener(origin)
      }
      const onActivated = () => void refresh()
      const onUpdated = (_tabId, _changeInfo, tab) => {
        if (tab.active || tab.url) void refresh()
      }

      tabs.onActivated?.addListener(onActivated)
      tabs.onUpdated?.addListener(onUpdated)
      void refresh()

      return () => {
        active = false
        tabs.onActivated?.removeListener(onActivated)
        tabs.onUpdated?.removeListener(onUpdated)
      }
    },
  }
}
