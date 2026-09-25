import { createV3Fetch } from '../src/v3Fetch'
import { createV3XHR } from '../src/v3XHR'

Object.assign(window, { AjaxProxyV3Runtime: { createV3Fetch, createV3XHR } })
