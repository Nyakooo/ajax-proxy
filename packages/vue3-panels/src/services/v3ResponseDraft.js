const DEFAULT_STATUS = 200

export function parseResponseBodyDraft(draft) {
  try {
    return { ok: true, body: JSON.parse(draft) }
  } catch {
    return { ok: false, error: 'invalid-json' }
  }
}

export function formatResponseBodyDraft(body) {
  return JSON.stringify(body, null, 2)
}

/**
 * Build a complete V3 rule from response editor drafts. Existing rule fields,
 * including its request action, are retained while the response action is replaced.
 */
export function buildV3ResponseRule({
  id,
  match,
  statusDraft = String(DEFAULT_STATUS),
  bodyDraft,
  existingRule,
}) {
  const statusText = String(statusDraft).trim()
  if (!/^\d+$/.test(statusText)) return { ok: false, error: 'invalid-status' }

  const status = Number(statusText)
  if (!Number.isSafeInteger(status) || status < 200 || status > 599) {
    return { ok: false, error: 'invalid-status' }
  }

  const parsedBody = parseResponseBodyDraft(bodyDraft)
  if (!parsedBody.ok) return parsedBody

  const rule = {
    ...(existingRule ?? {}),
    id: id ?? existingRule?.id,
    enabled: existingRule?.enabled ?? true,
    match: match ?? existingRule?.match,
    response: {
      enabled: true,
      replace: {
        ...(existingRule?.response?.replace ?? {}),
        status,
        body: parsedBody.body,
      },
    },
  }

  return { ok: true, rule }
}
