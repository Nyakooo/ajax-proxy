import { describe, expect, it } from 'vitest'
import { formatV3ValidationIssues, parseV3BackupJson, selectV3Rule, validateV3Backup } from '../src'

const validBackup = {
  format: 'ajax-proxy-backup',
  formatVersion: 3,
  settings: { globalEnabled: true, mode: 'interceptor', language: 'zh-CN' },
  tags: [],
  rules: [
    {
      id: 'rule-1',
      enabled: true,
      match: { url: '/api/items', method: 'GET', type: 'normal' },
      response: { enabled: true, replace: { status: 200, body: { items: [] } } },
    },
  ],
}

describe('V3 backup schema', () => {
  it('accepts a versioned V3 full snapshot, including an empty rule list', () => {
    expect(validateV3Backup({ ...validBackup, rules: [] })).toMatchObject({ ok: true })
  })

  it('rejects a missing, null, or invalid rule collection instead of treating it as empty', () => {
    for (const rules of [undefined, null, {}]) {
      const backup = { ...validBackup, rules }
      if (rules === undefined) delete (backup as { rules?: unknown }).rules
      expect(validateV3Backup(backup)).toMatchObject({ ok: false })
    }
  })

  it('rejects V2 backups with an explicit unsupported-format issue', () => {
    expect(validateV3Backup({ globalSwitchOn: true, proxy_routes: [] })).toMatchObject({
      ok: false,
      issues: [
        {
          path: 'format',
          message: 'V2 backup files are not supported. Export a V3 backup instead.',
        },
      ],
    })
  })

  it('reports duplicate rule IDs and invalid response fields with paths', () => {
    const duplicateRule = structuredClone(validBackup.rules[0])
    const backup = {
      ...validBackup,
      rules: [validBackup.rules[0], duplicateRule],
    }
    backup.rules[1].response.replace.status = 700

    const result = validateV3Backup(backup)

    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: 'rules[1].id',
        message: 'Rule IDs must be unique.',
      })
      expect(result.issues).toContainEqual({
        path: 'rules[1].response.replace.status',
        message: 'Expected an integer from 200 to 599.',
      })
    }
  })

  it('parses a JSON backup and returns readable syntax and field errors', () => {
    expect(parseV3BackupJson(`\uFEFF${JSON.stringify(validBackup)}`)).toMatchObject({
      ok: true,
      warnings: [],
    })
    const syntaxError = parseV3BackupJson('{ invalid')
    expect(syntaxError).toMatchObject({
      ok: false,
      issues: [{ path: '$', message: expect.stringContaining('Invalid JSON:') }],
    })

    const invalidBackup = {
      ...validBackup,
      rules: [{ ...validBackup.rules[0], match: { url: '' } }],
    }
    const validationError = parseV3BackupJson(JSON.stringify(invalidBackup))
    expect(validationError).toMatchObject({ ok: false })
    if (!validationError.ok) {
      expect(formatV3ValidationIssues(validationError.issues)).toContain(
        'rules[0].match.url: Expected a non-empty string up to 4096 characters.'
      )
    }
  })

  it('warns about imported function code and disables the function action', () => {
    const backup = structuredClone(validBackup)
    backup.rules[0].response = {
      enabled: true,
      replace: { code: '() => ({ body: "untrusted" })' },
    }

    const result = parseV3BackupJson(JSON.stringify(backup))

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.data.rules[0].enabled).toBe(true)
      expect(result.data.rules[0].response?.enabled).toBe(false)
      expect(result.warnings).toEqual([
        {
          path: 'rules[0].response.replace.code',
          message: 'Imported function code is untrusted and will not run until explicitly enabled.',
        },
      ])
    }
    expect(backup.rules[0].response.enabled).toBe(true)
  })

  it('rejects malformed regexes, unsafe redirects, methods, and response headers', () => {
    const invalidBackup = structuredClone(validBackup)
    const rule = invalidBackup.rules[0] as unknown as Record<string, unknown>
    rule.match = { url: '[', type: 'regex', method: 'GET\n' }
    rule.request = {
      enabled: true,
      redirect: { url: 'javascript:alert(1)' },
    }
    const response = rule.response as { replace: Record<string, unknown> }
    response.replace.headers = {
      'bad header': 'value\r\nInjected: yes',
    }

    const result = validateV3Backup(invalidBackup)

    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      expect(result.issues.map(({ path }) => path)).toEqual(
        expect.arrayContaining([
          'rules[0].match.method',
          'rules[0].match.url',
          'rules[0].request.redirect.url',
          'rules[0].response.replace.headers',
        ])
      )
    }
  })

  it('rejects native JavaScript regex features outside the safe RE2 syntax', () => {
    const backup = structuredClone(validBackup)
    ;(backup.rules[0] as unknown as Record<string, unknown>).match = {
      url: '(?=admin)',
      type: 'regex',
    }
    expect(validateV3Backup(backup)).toMatchObject({ ok: false })
  })

  it('bounds backup size, rule count, function source, and JSON body complexity', () => {
    const oversizedText = ' '.repeat(5 * 1024 * 1024 + 1)
    expect(parseV3BackupJson(oversizedText)).toMatchObject({
      ok: false,
      issues: [{ path: '$', message: expect.stringContaining('must not exceed') }],
    })
    const oversizedUtf8Text = 'é'.repeat(2.5 * 1024 * 1024 + 1)
    expect(parseV3BackupJson(oversizedUtf8Text)).toMatchObject({ ok: false })

    const tooManyRules = structuredClone(validBackup)
    tooManyRules.rules = Array.from({ length: 5001 }, (_, index) => ({
      ...validBackup.rules[0],
      id: `rule-${index}`,
    }))
    expect(validateV3Backup(tooManyRules)).toMatchObject({ ok: false })

    const tooDeepBody = structuredClone(validBackup)
    let body: Record<string, unknown> = {}
    ;(tooDeepBody.rules[0].response.replace as Record<string, unknown>).body = body
    for (let index = 0; index < 66; index += 1) {
      const child: Record<string, unknown> = {}
      body.nested = child
      body = child
    }
    expect(validateV3Backup(tooDeepBody)).toMatchObject({ ok: false })

    const tooManyBodyNodes = structuredClone(validBackup)
    ;(tooManyBodyNodes.rules[0].response.replace as Record<string, unknown>).body =
      Array(50001).fill(null)
    expect(validateV3Backup(tooManyBodyNodes)).toMatchObject({ ok: false })

    const tooMuchCode = structuredClone(validBackup)
    ;(tooMuchCode.rules[0].response.replace as Record<string, unknown>).code = 'x'.repeat(65537)
    expect(validateV3Backup(tooMuchCode)).toMatchObject({ ok: false })
  })
})

describe('V3 rule selection', () => {
  const requestRule = (id: string, url: string, method = 'GET') => ({
    id,
    enabled: true,
    match: { url, method },
    request: { enabled: true, redirect: { url: 'https://target.test/' } },
  })

  it('selects and locks the first complete match against the original request', () => {
    const rules = [
      requestRule('wrong-method', '/api', 'POST'),
      requestRule('first-match', '/api'),
      requestRule('later-match', '/api'),
    ]

    expect(selectV3Rule(rules, { url: 'https://example.test/api/items', method: 'get' })).toEqual({
      rule: rules[1],
      index: 1,
      originalRequest: { url: 'https://example.test/api/items', method: 'GET' },
    })
  })

  it('skips disabled rules and rules without an enabled action', () => {
    const disabledRule = { ...requestRule('disabled', '/api'), enabled: false }
    const noEnabledAction = {
      ...requestRule('inert', '/api'),
      request: { enabled: false, redirect: { url: 'https://target.test/' } },
      response: { enabled: false, replace: { body: null } },
    }
    const laterRule = requestRule('active', '/api')

    expect(
      selectV3Rule([disabledRule, noEnabledAction, laterRule], {
        url: 'https://example.test/api',
        method: 'GET',
      })?.rule
    ).toBe(laterRule)
  })

  it('treats an omitted method and ANY as wildcards and method tokens case-insensitively', () => {
    const anyRule = requestRule('any', '/api', 'aNy')
    const lowerRule = requestRule('lower', '/api', 'get')

    expect(selectV3Rule([anyRule], { url: '/api', method: 'DELETE' })?.rule).toBe(anyRule)
    expect(selectV3Rule([lowerRule], { url: '/api', method: 'GET' })?.rule).toBe(lowerRule)
    expect(
      selectV3Rule([{ ...lowerRule, match: { url: '/api' } }], {
        url: '/api',
        method: 'PATCH',
      })?.rule.id
    ).toBe('lower')
  })

  it('uses case-sensitive substring matching and case-insensitive RE2 matching', () => {
    const normalRule = requestRule('normal', '/API')
    const regexRule = {
      ...requestRule('regex', '/api/[0-9]+'),
      match: { url: '/api/[0-9]+', type: 'regex' as const },
    }

    expect(selectV3Rule([normalRule], { url: '/api/1', method: 'GET' })).toBeUndefined()
    expect(selectV3Rule([regexRule], { url: '/API/123', method: 'GET' })?.rule).toBe(regexRule)
  })

  it('skips matcher failures and overlong inputs safely', () => {
    const invalidRegex = {
      ...requestRule('invalid', '['),
      match: { url: '[', type: 'regex' as const },
    }
    const laterRule = requestRule('later', 'api')

    expect(selectV3Rule([invalidRegex, laterRule], { url: '/api', method: 'GET' })?.rule).toBe(
      laterRule
    )
    expect(
      selectV3Rule([laterRule], { url: '/'.padEnd(65537, 'x'), method: 'GET' })
    ).toBeUndefined()
  })
})
