export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface V3Tag {
  id: string
  name: string
  used: boolean
}

export interface V3Rule {
  id: string
  enabled: boolean
  match: {
    url: string
    method?: string
    type?: 'normal' | 'regex'
  }
  request?: {
    enabled: boolean
    redirect: { url: string }
  }
  response?: {
    enabled: boolean
    replace: {
      status?: number
      headers?: Record<string, string>
      body?: JsonValue
      code?: string
    }
  }
}
