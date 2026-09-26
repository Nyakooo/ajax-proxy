import { describe, expect, it } from 'vitest'
import { onLoadForDataConversion, onUploadForDataConversion } from '../src'

describe('V2 data compatibility', () => {
  it('converts legacy global state and reports the keys that should be removed', () => {
    const result = onLoadForDataConversion({
      globalSwitchOn: true,
      mode: 'interceptor',
      proxy_routes: [
        {
          id: 'intercept-1',
          switchOn: true,
          filterType: 'regex',
          method: 'POST',
          remark: 'request rule',
          match: '/v1/items',
          tagId: 'tag-1',
          statusCode: '209',
          override: '{"ok":true}',
          hit: 3,
        },
      ],
      redirect: [
        {
          id: 'redirect-1',
          switchOn: false,
          filterType: 'normal',
          method: 'GET',
          remark: 'redirect rule',
          domain: 'https://example.test/api',
          redirect: 'https://target.test/api',
          headers: [{ key: 'x-test', value: 'yes' }],
          whitelist: ['/health'],
        },
      ],
    })

    expect(result).toEqual({
      changed: true,
      data: {
        global_on: true,
        mode: 'interceptor',
        interceptor_matching_content: [
          {
            id: 'intercept-1',
            switch_on: true,
            filter_type: 'regex',
            method: 'POST',
            remark: 'request rule',
            match_url: '/v1/items',
            tagId: 'tag-1',
            status_code: '209',
            override: '{"ok":true}',
            hit: 3,
          },
        ],
        redirector_matching_content: [
          {
            id: 'redirect-1',
            switch_on: false,
            filter_type: 'normal',
            method: 'GET',
            remark: 'redirect rule',
            domain: 'https://example.test/api',
            redirect_url: 'https://target.test/api',
            headers: [{ key: 'x-test', value: 'yes' }],
            ignores: ['/health'],
          },
        ],
      },
      changeKeywords: ['globalSwitchOn', 'mode', 'proxy_routes', 'redirect'],
    })
  })

  it('applies legacy defaults while converting upload data and leaves current data unchanged', () => {
    const legacyUpload = {
      lang: 'zh',
      mode: 'redirector',
      tags: [{ id: 'tag-1', name: 'api', used: true }],
      proxy_routes: [{ match: '/api', switchOn: true }],
      redirect: [],
    }

    expect(onUploadForDataConversion(legacyUpload)).toEqual({
      language: 'zh',
      mode: 'redirector',
      tags: [{ id: 'tag-1', name: 'api', used: true }],
      interceptors: [
        {
          id: '',
          switch_on: true,
          filter_type: 'normal',
          method: 'ANY',
          remark: '',
          match_url: '/api',
          tagId: '',
          status_code: '200',
          override: '',
          hit: 0,
        },
      ],
      redirectors: [],
    })

    const currentUpload = {
      language: 'en',
      mode: 'interceptor' as const,
      tags: [],
      interceptors: [],
      redirectors: [],
    }
    expect(onUploadForDataConversion(currentUpload)).toBe(currentUpload)

    const currentState = { global_on: true, mode: 'interceptor' as const }
    const loadResult = onLoadForDataConversion(currentState)
    expect(loadResult).toEqual({ changed: false, data: currentState, changeKeywords: [] })
    expect(loadResult.data).toBe(currentState)
  })

  it('preserves interceptor and redirect lists that are not in the legacy shape', () => {
    const interceptors = [{ match_url: '/already-current' }]
    const redirectors = [{ redirect_url: 'https://target.test' }]

    const result = onLoadForDataConversion({
      globalSwitchOn: true,
      mode: 'interceptor',
      proxy_routes: interceptors,
      redirect: redirectors,
    })

    expect(result).toEqual({
      changed: true,
      data: {
        global_on: true,
        mode: 'interceptor',
        interceptor_matching_content: interceptors,
        redirector_matching_content: redirectors,
      },
      changeKeywords: ['globalSwitchOn', 'mode', 'proxy_routes', 'redirect'],
    })
    expect(result.data.interceptor_matching_content).toBe(interceptors)
    expect(result.data.redirector_matching_content).toBe(redirectors)
  })
})
