import { createV3Fetch } from '../../src/v3/fetch'
import { createV3XHR } from '../../src/v3/xhr'

Object.assign(window, { AjaxProxyV3Runtime: { createV3Fetch, createV3XHR } })
