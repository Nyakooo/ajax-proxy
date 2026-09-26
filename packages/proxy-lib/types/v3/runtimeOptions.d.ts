import type { V3Rule } from '@proxy/v3-domain'
import type {
  V3FetchOutcomeReason,
  V3FetchOutcomeStage,
  V3FetchOutcomeStatus,
  V3FunctionErrorCode,
} from '@proxy/protocol'
import type { V3XHROutcomeReason } from '@proxy/protocol'
import type {
  V3RequestRedirectFunctionExecutor,
  V3ResponseFunctionExecutor,
} from './responseFunctionSandbox'
export interface V3RuntimeHostOptions {
  getRules: () => readonly V3Rule[]
  onMatched?: (
    rule: V3Rule,
    index: number,
    request: {
      url: string
      method: string
    }
  ) => void
  onNoMatch?: (request: { url: string; method: string }) => void
  onFunctionError?: (
    rule: V3Rule,
    request: {
      url: string
      method: string
    },
    code: V3FunctionErrorCode,
    action: 'redirect' | 'response'
  ) => void
  isFetchOutcomeDiagnosticsArmed?: () => boolean
  onFetchOutcome?: (
    rule: V3Rule,
    correlationId: string,
    stage: V3FetchOutcomeStage,
    outcome: V3FetchOutcomeStatus,
    reason: V3FetchOutcomeReason
  ) => void
  onXHROutcome?: (
    rule: V3Rule,
    correlationId: string,
    stage: V3FetchOutcomeStage,
    outcome: V3FetchOutcomeStatus,
    reason: V3XHROutcomeReason
  ) => void
  executeRedirectFunction?: V3RequestRedirectFunctionExecutor
  executeResponseFunction?: V3ResponseFunctionExecutor
}
