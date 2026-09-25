import type { V3Rule } from '@proxy/v3-domain'

function responseMetadataProxy(response: Response, original: Response): Response {
  return new Proxy(response, {
    get(target, property) {
      if (property === 'url' || property === 'redirected' || property === 'type') {
        return Reflect.get(original, property, original)
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' && property !== 'constructor' ? value.bind(target) : value
    },
  })
}

export async function replaceFetchResponse(response: Response, request: Request, rule: V3Rule) {
  const replace = rule.response?.replace
  if (!rule.response?.enabled || !replace) return response
  // Function execution is deliberately not performed in this page-world prototype.
  if (typeof replace.code === 'string' && replace.code.trim() !== '') return response

  try {
    const status = replace.status ?? response.status
    const hasNoBody = request.method === 'HEAD' || [204, 205, 304].includes(status)
    const headers = new Headers(response.headers)
    if (replace.headers) {
      for (const [name, value] of Object.entries(replace.headers)) headers.set(name, value)
    }
    headers.delete('content-length')
    headers.delete('content-encoding')
    headers.delete('content-range')
    headers.delete('transfer-encoding')

    let body: BodyInit | null
    if (hasNoBody) body = null
    else if (replace.body !== undefined) body = JSON.stringify(replace.body)
    else body = response.body ? response.clone().body : null

    const updated = new Response(body, {
      status,
      statusText: response.statusText,
      headers,
    })
    return responseMetadataProxy(updated, response)
  } catch {
    return response
  }
}
