import { createPanel } from './panel'
import type { PanelScreen } from './popupPanel'

function validScreen(value: unknown): value is PanelScreen {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const screen = value as Record<string, unknown>
  const keys = ['left', 'top', 'width', 'height']
  if (Object.keys(screen).length !== 4 || Object.keys(screen).some((key) => !keys.includes(key)))
    return false
  if (keys.some((key) => !Object.hasOwn(screen, key) || !Number.isSafeInteger(screen[key])))
    return false
  return (
    Math.abs(screen.left as number) <= 50000 &&
    Math.abs(screen.top as number) <= 50000 &&
    (screen.width as number) >= 400 &&
    (screen.width as number) <= 20000 &&
    (screen.height as number) >= 300 &&
    (screen.height as number) <= 20000
  )
}

/** Only our quick popup may ask the background to open a rule editor. */
export function handlePopupMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): boolean {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false
  const request = message as Record<string, unknown>
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL('panels-v3/popup.html') ||
    request.type !== 'ajax-proxy:open-panel' ||
    Object.keys(request).some(
      (key) => !['type', 'ruleId', 'action', 'target', 'screen'].includes(key)
    ) ||
    (request.target !== undefined && !['window', 'tab'].includes(String(request.target))) ||
    (request.screen !== undefined && !validScreen(request.screen)) ||
    (request.ruleId !== undefined &&
      (typeof request.ruleId !== 'string' ||
        !request.ruleId.trim() ||
        request.ruleId.length > 256)) ||
    (request.action !== undefined &&
      (request.ruleId === undefined || !['response', 'redirect'].includes(String(request.action))))
  )
    return false

  void createPanel(
    request.ruleId as string | undefined,
    request.action as 'response' | 'redirect' | undefined,
    (request.target as 'window' | 'tab' | undefined) ?? 'window',
    request.screen as PanelScreen | undefined
  )
    .then(() => sendResponse({ ok: true }))
    .catch((error: unknown) => {
      const details = error instanceof Error ? error.message : String(error ?? 'Unknown error')
      console.error('[AjaxProxy] Could not open the full panel', error)
      sendResponse({ ok: false, error: 'panel-open-failed', details })
    })
  return true
}
