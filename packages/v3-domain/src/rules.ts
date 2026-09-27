export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface V3ResponseFunctionResult {
  status?: number
  headers?: Record<string, string>
  body?: JsonValue
}

export interface V3Tag {
  id: string
  name: string
  used: boolean
}

export type V3RedirectConfig =
  | { url: string; exclusions?: string[]; headers?: Record<string, string> }
  | { type: 'function'; code: string; exclusions?: string[] }

export interface V3Rule {
  id: string
  enabled: boolean
  /** Pinned rules execute before unpinned rules while preserving order within each group. */
  pinned?: boolean
  /** Optional IDs from the backup's tag collection; omitted means untagged. */
  tagIds?: string[]
  match: {
    url: string
    method?: string
    type?: 'normal' | 'regex' | 'exact'
  }
  request?: {
    enabled: boolean
    redirect: V3RedirectConfig
  }
  response?: {
    enabled: boolean
    /** `replace` is the default; `mock` skips the real request and returns static data. */
    mode?: 'replace' | 'mock'
    replace: {
      status?: number
      headers?: Record<string, string>
      body?: JsonValue
      code?: string
    }
  }
}
