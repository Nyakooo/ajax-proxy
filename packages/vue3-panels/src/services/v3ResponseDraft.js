const DEFAULT_STATUS = 200

function getJsonErrorLocation(message, draft) {
  if (typeof message !== 'string') return null

  const source = String(draft)
  const position = message.match(/\bat position (\d+)\b/)
  if (position) {
    const offset = Number(position[1])
    if (!Number.isSafeInteger(offset) || offset > source.length) return null

    let line = 1
    let column = 1
    for (let index = 0; index < offset; index += 1) {
      const code = source.charCodeAt(index)
      if (code === 10) {
        line += 1
        column = 1
      } else if (code === 13) {
        if (source.charCodeAt(index + 1) === 10 && index + 1 < offset) index += 1
        line += 1
        column = 1
      } else if (code === 0x2028 || code === 0x2029) {
        line += 1
        column = 1
      } else {
        column += 1
      }
    }
    return { line, column }
  }

  const lineColumn = message.match(/\(line (\d+) column (\d+)\)/)
  if (!lineColumn) return null
  const line = Number(lineColumn[1])
  const column = Number(lineColumn[2])
  return Number.isSafeInteger(line) && line > 0 && Number.isSafeInteger(column) && column > 0
    ? { line, column }
    : null
}

export function parseResponseBodyDraft(draft) {
  try {
    return { ok: true, body: JSON.parse(draft) }
  } catch (error) {
    return {
      ok: false,
      error: 'invalid-json',
      location: getJsonErrorLocation(error?.message, draft),
    }
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
  delete rule.response.replace.code

  return { ok: true, rule }
}
