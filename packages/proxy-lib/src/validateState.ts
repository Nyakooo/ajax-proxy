import {
  isRecord,
  isValidGlobalState as isProtocolGlobalState,
  isValidInterceptors as areProtocolInterceptors,
  isValidMode,
  isValidRedirectors as areProtocolRedirectors,
} from '@proxy/protocol'
import { IGlobalState, IMatchInterceptorContent, IMatchRedirectContent } from './types'

export { isRecord, isValidMode }

export function isValidInterceptors(value: unknown): value is IMatchInterceptorContent[] {
  return areProtocolInterceptors(value)
}

export function isValidRedirectors(value: unknown): value is IMatchRedirectContent[] {
  return areProtocolRedirectors(value)
}

export function isValidGlobalState(value: unknown): value is IGlobalState {
  return isProtocolGlobalState(value)
}
