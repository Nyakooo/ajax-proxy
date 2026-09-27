import { createPanel } from './panel'

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
    Object.keys(request).some((key) => !['type', 'ruleId', 'action'].includes(key)) ||
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
    request.action as 'response' | 'redirect' | undefined
  )
    .then(() => sendResponse({ ok: true }))
    .catch((error: unknown) => {
      const details = error instanceof Error ? error.message : String(error ?? 'Unknown error')
      console.error('[AjaxProxy] Could not open the full panel', error)
      sendResponse({ ok: false, error: 'panel-open-failed', details })
    })
  return true
}
