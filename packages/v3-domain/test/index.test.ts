import { describe, expect, it } from 'vitest'
import {
  analyzeV3RuleMatches,
  formatV3ValidationIssues,
  isV3OriginDisabled,
  normalizeV3Origin,
  parseV3BackupJson,
  selectV3Rule,
  validateV3Backup,
  validateV3ResponseFunctionResult,
  V3_FUNCTION_RESULT_MAX_BYTES,
} from '../src'

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

  it('reads legacy V3 backups while reserving exact URL matching for format version 4', () => {
    expect(validateV3Backup(validBackup)).toMatchObject({ ok: true })

    const exactBackup = structuredClone(validBackup)
    exactBackup.formatVersion = 4
    exactBackup.rules[0].match.type = 'exact'
    expect(validateV3Backup(exactBackup)).toMatchObject({ ok: true })
    expect(parseV3BackupJson(JSON.stringify(exactBackup))).toMatchObject({
      ok: true,
      data: { formatVersion: 5, disabledOrigins: [], rules: [{ match: { type: 'exact' } }] },
    })

    const unsupportedLegacyExactBackup = structuredClone(validBackup)
    unsupportedLegacyExactBackup.rules[0].match.type = 'exact'
    expect(validateV3Backup(unsupportedLegacyExactBackup)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ path: 'rules[0].match.type' })]),
    })
  })

  it('normalizes V3 and V4 backups with an empty disabled-origin list', () => {
    for (const formatVersion of [3, 4]) {
      const backup = { ...structuredClone(validBackup), formatVersion }
      const validation = validateV3Backup(backup)
      expect(validation).toMatchObject({
        ok: true,
        data: { formatVersion: 5, disabledOrigins: [] },
      })
      expect(parseV3BackupJson(JSON.stringify(backup))).toMatchObject({
        ok: true,
        data: { formatVersion: 5, disabledOrigins: [] },
      })
    }
  })

  it('validates and roundtrips canonical V5 disabled origins', () => {
    const backup = {
      ...structuredClone(validBackup),
      formatVersion: 5,
      disabledOrigins: ['https://example.com', 'http://localhost:5173'],
    }
    expect(validateV3Backup(backup)).toMatchObject({
      ok: true,
      data: { formatVersion: 5, disabledOrigins: backup.disabledOrigins },
    })
    expect(parseV3BackupJson(JSON.stringify(backup))).toMatchObject({
      ok: true,
      data: { formatVersion: 5, disabledOrigins: backup.disabledOrigins },
    })
  })

  it('requires strict V5 disabled-origin data and rejects unknown, noncanonical, invalid, and duplicate entries', () => {
    const base = {
      ...structuredClone(validBackup),
      formatVersion: 5,
      disabledOrigins: [] as unknown,
    }
    const missing = { ...base }
    delete (missing as { disabledOrigins?: unknown }).disabledOrigins
    expect(validateV3Backup(missing)).toMatchObject({ ok: false })
    expect(validateV3Backup({ ...base, extra: true })).toMatchObject({ ok: false })

    for (const disabledOrigins of [
      null,
      ['https://example.com/path'],
      ['https://user:pass@example.com'],
      ['https://example.com/'],
      ['ftp://example.com'],
      ['https://example.com', 'https://example.com'],
      [42],
    ]) {
      expect(validateV3Backup({ ...base, disabledOrigins })).toMatchObject({ ok: false })
    }

    const legacyWithNewField = { ...structuredClone(validBackup), disabledOrigins: [] }
    expect(validateV3Backup(legacyWithNewField)).toMatchObject({ ok: false })
  })

  it('normalizes HTTP(S) URLs to origins and checks disabled origins exactly', () => {
    expect(normalizeV3Origin('https://Example.com:443/path?q=1')).toBe('https://example.com')
    expect(normalizeV3Origin('http://localhost:8080/a')).toBe('http://localhost:8080')
    expect(normalizeV3Origin('file:///tmp/data')).toBeNull()
    expect(normalizeV3Origin('not a URL')).toBeNull()
    expect(normalizeV3Origin(null)).toBeNull()
    expect(isV3OriginDisabled('https://example.com/a', ['https://example.com'])).toBe(true)
    expect(isV3OriginDisabled('https://sub.example.com', ['https://example.com'])).toBe(false)
    expect(isV3OriginDisabled('http://example.com', ['https://example.com'])).toBe(false)
  })

  it('accepts rules referencing multiple existing tags and older rules without tagIds', () => {
    const backup = structuredClone(validBackup)
    backup.tags = [
      { id: 'tag-a', name: 'A', used: true },
      { id: 'tag-b', name: 'B', used: true },
    ]
    ;(backup.rules[0] as (typeof backup.rules)[number] & { tagIds?: string[] }).tagIds = [
      'tag-a',
      'tag-b',
    ]

    expect(validateV3Backup(backup)).toMatchObject({ ok: true })
    const olderV3Backup = structuredClone(validBackup)
    expect(validateV3Backup(olderV3Backup)).toMatchObject({ ok: true })
  })

  it('rejects malformed, empty, duplicate, and unknown tag references', () => {
    const base = structuredClone(validBackup)
    base.tags = [{ id: 'tag-a', name: 'A', used: true }]
    const invalidTagIds: unknown[] = [null, 'tag-a', [''], ['tag-a', 'tag-a'], ['missing'], [42]]

    for (const tagIds of invalidTagIds) {
      const backup = structuredClone(base)
      ;(backup.rules[0] as unknown as Record<string, unknown>).tagIds = tagIds
      expect(validateV3Backup(backup)).toMatchObject({ ok: false })
    }
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

    for (const nonFiniteBody of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalidJsonBody = structuredClone(validBackup)
      ;(invalidJsonBody.rules[0].response.replace as Record<string, unknown>).body = nonFiniteBody
      expect(validateV3Backup(invalidJsonBody)).toMatchObject({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ path: 'rules[0].response.replace.body' }),
        ]),
      })
    }

    const tooMuchCode = structuredClone(validBackup)
    ;(tooMuchCode.rules[0].response.replace as Record<string, unknown>).code = 'x'.repeat(65537)
    expect(validateV3Backup(tooMuchCode)).toMatchObject({ ok: false })
  })

  it('enforces regex, header, and disabled-origin collection limits', () => {
    const tooManyRegexRules = structuredClone(validBackup)
    tooManyRegexRules.rules = Array.from({ length: 101 }, (_, index) => ({
      ...validBackup.rules[0],
      id: `regex-${index}`,
      match: { url: `^/resource/${index}$`, type: 'regex' as const },
    }))
    expect(validateV3Backup(tooManyRegexRules)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: 'rules',
          message: 'At most 100 regular expression rules are allowed.',
        }),
      ]),
    })

    const tooManyHeaders = structuredClone(validBackup)
    ;(tooManyHeaders.rules[0].response.replace as Record<string, unknown>).headers =
      Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`x-header-${index}`, 'ok']))
    expect(validateV3Backup(tooManyHeaders)).toMatchObject({ ok: false })

    const tooManyHeaderBytes = structuredClone(validBackup)
    ;(tooManyHeaderBytes.rules[0].response.replace as Record<string, unknown>).headers = {
      'x-first': 'a'.repeat(8192),
      'x-second': 'b'.repeat(8192),
      'x-third': 'c'.repeat(8192),
      'x-fourth': 'd'.repeat(8192),
      'x-fifth': 'e'.repeat(8192),
    }
    expect(validateV3Backup(tooManyHeaderBytes)).toMatchObject({ ok: false })

    const tooManyDisabledOrigins = {
      ...structuredClone(validBackup),
      formatVersion: 5,
      disabledOrigins: Array.from(
        { length: 1001 },
        (_, index) => `https://site-${index}.example.test`
      ),
    }
    expect(validateV3Backup(tooManyDisabledOrigins)).toMatchObject({ ok: false })
  })

  it('rejects malformed settings, rules, action payloads, and header maps by path', () => {
    const malformedSettings = { ...structuredClone(validBackup), settings: null }
    const nonObjectRule = { ...structuredClone(validBackup), rules: [null] }

    const malformedAction = structuredClone(validBackup)
    ;(malformedAction.rules[0] as unknown as Record<string, unknown>).request = null

    const malformedPayload = structuredClone(validBackup)
    ;(malformedPayload.rules[0].response as unknown) = { enabled: true, replace: null }

    const malformedHeaders = structuredClone(validBackup)
    ;(malformedHeaders.rules[0].response.replace as Record<string, unknown>).headers = null

    const ruleWithoutActions = structuredClone(validBackup)
    delete (ruleWithoutActions.rules[0] as { response?: unknown }).response

    const cases: Array<{ value: unknown; path: string }> = [
      { value: malformedSettings, path: 'settings' },
      { value: nonObjectRule, path: 'rules[0]' },
      { value: malformedAction, path: 'rules[0].request' },
      { value: malformedPayload, path: 'rules[0].response.replace' },
      { value: malformedHeaders, path: 'rules[0].response.replace.headers' },
      { value: ruleWithoutActions, path: 'rules[0]' },
    ]

    for (const { value, path } of cases) {
      const result = validateV3Backup(value)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues.map(({ path: issuePath }) => issuePath)).toContain(path)
    }
  })

  it('rejects rule-level unknown fields and objects with throwing prototype traps', () => {
    const ruleWithUnknownField = structuredClone(validBackup)
    ;(ruleWithUnknownField.rules[0] as unknown as Record<string, unknown>).unexpected = true
    expect(validateV3Backup(ruleWithUnknownField)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: 'rules[0]',
          message: 'Rule contains an unsupported field.',
        }),
      ]),
    })

    const hostileObject = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('prototype access blocked')
        },
      }
    )
    expect(validateV3Backup(hostileObject)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: '$', message: 'Expected a backup object.' }),
      ]),
    })
  })

  it('rejects invalid rule identity, enabled flags, matcher URLs, and action flags', () => {
    const invalidFields = structuredClone(validBackup)
    const rule = invalidFields.rules[0] as unknown as Record<string, unknown>
    rule.id = '  '
    rule.enabled = 'yes'
    rule.match = { url: '  ', method: 'GET', type: 'normal' }
    rule.request = { enabled: 'yes', redirect: { url: '/target' } }
    rule.response = { enabled: 'yes', replace: {} }

    expect(validateV3Backup(invalidFields)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'rules[0].id' }),
        expect.objectContaining({ path: 'rules[0].enabled' }),
        expect.objectContaining({ path: 'rules[0].match.url' }),
        expect.objectContaining({ path: 'rules[0].request.enabled' }),
        expect.objectContaining({ path: 'rules[0].response.enabled' }),
      ]),
    })
  })

  it('rejects duplicate tag IDs and invalid tag labels or used flags', () => {
    const backupWithInvalidTags = {
      ...structuredClone(validBackup),
      tags: [
        { id: 'shared', name: 'First', used: true },
        { id: 'shared', name: '  ', used: 'yes' },
      ],
    }

    expect(validateV3Backup(backupWithInvalidTags)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'tags[1].id', message: 'Tag IDs must be unique.' }),
        expect.objectContaining({ path: 'tags[1].name' }),
        expect.objectContaining({ path: 'tags[1].used' }),
      ]),
    })
  })

  it('rejects invalid backup settings values by field path', () => {
    const invalidSettings = {
      ...structuredClone(validBackup),
      settings: { globalEnabled: 'yes', mode: 'unknown', language: 'fr' },
    }

    expect(validateV3Backup(invalidSettings)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'settings.globalEnabled' }),
        expect.objectContaining({ path: 'settings.mode' }),
        expect.objectContaining({ path: 'settings.language' }),
      ]),
    })
  })

  it('rejects non-object tags and empty tag IDs', () => {
    const backupWithMalformedTags = {
      ...structuredClone(validBackup),
      tags: [null, { id: '', name: 'No ID', used: true }],
    }

    expect(validateV3Backup(backupWithMalformedTags)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'tags[0]' }),
        expect.objectContaining({ path: 'tags[1].id' }),
      ]),
    })
  })
})

describe('V3 response function result validation', () => {
  it('accepts and clones a supported JSON response result', () => {
    const result = { status: 201, headers: { 'x-proxy': 'mock' }, body: { ok: true, data: null } }
    const validated = validateV3ResponseFunctionResult(result)
    expect(validated).toEqual({ ok: true, data: result })
    if (validated.ok) expect(validated.data).not.toBe(result)
  })

  it('rejects invalid, non-JSON, unsupported, and oversized results', () => {
    expect(validateV3ResponseFunctionResult({})).toEqual({
      ok: false,
      issue: 'The result must change at least one field.',
    })
    expect(validateV3ResponseFunctionResult({ status: 101 })).toMatchObject({ ok: false })
    expect(validateV3ResponseFunctionResult({ body: Number.NaN })).toMatchObject({ ok: false })
    expect(validateV3ResponseFunctionResult({ headers: { 'bad header': 'x' } })).toMatchObject({
      ok: false,
    })
    expect(validateV3ResponseFunctionResult({ body: {}, extra: true })).toMatchObject({ ok: false })
    expect(
      validateV3ResponseFunctionResult({ body: 'x'.repeat(V3_FUNCTION_RESULT_MAX_BYTES) })
    ).toMatchObject({ ok: false })
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(validateV3ResponseFunctionResult({ body: cyclic })).toMatchObject({ ok: false })
    expect(validateV3ResponseFunctionResult({ body: new Date() })).toMatchObject({ ok: false })
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

  it('explains the first-match outcome and the reason each earlier rule was skipped', () => {
    const wrongMethod = requestRule('wrong-method', '/api', 'POST')
    const wrongUrl = requestRule('wrong-url', '/other')
    const disabled = { ...requestRule('disabled', '/api'), enabled: false }
    const noActions = {
      ...requestRule('no-actions', '/api'),
      request: { enabled: false, redirect: { url: 'https://target.test/' } },
    }
    const firstMatch = requestRule('first-match', '/api')
    const laterMatch = requestRule('later-match', '/api')

    expect(
      analyzeV3RuleMatches([wrongMethod, wrongUrl, disabled, noActions, firstMatch, laterMatch], {
        url: 'https://example.test/api/items',
        method: 'get',
      })
    ).toEqual({
      selectedRuleId: 'first-match',
      results: [
        { ruleId: 'wrong-method', index: 0, reason: 'method-mismatch' },
        { ruleId: 'wrong-url', index: 1, reason: 'url-mismatch' },
        { ruleId: 'disabled', index: 2, reason: 'rule-disabled' },
        { ruleId: 'no-actions', index: 3, reason: 'actions-disabled' },
        { ruleId: 'first-match', index: 4, reason: 'matched' },
        { ruleId: 'later-match', index: 5, reason: 'lower-priority' },
      ],
    })
  })

  it('reports global disable, invalid regex, and oversized URL without selecting a rule', () => {
    const activeRule = requestRule('active', '/api')
    const invalidRegex = {
      ...requestRule('invalid-regex', '['),
      match: { url: '[', type: 'regex' as const },
    }

    expect(
      analyzeV3RuleMatches([activeRule], { url: '/api', method: 'GET' }, false).results
    ).toEqual([{ ruleId: 'active', index: 0, reason: 'global-disabled' }])
    expect(
      analyzeV3RuleMatches([invalidRegex], { url: '/api', method: 'GET' }).results[0].reason
    ).toBe('invalid-regex')
    expect(
      analyzeV3RuleMatches([activeRule], { url: '/'.padEnd(65537, 'x'), method: 'GET' }).results[0]
        .reason
    ).toBe('request-too-long')
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

  it('refreshes cached regexes and remains correct after evicting the oldest entry', () => {
    const rules = Array.from({ length: 257 }, (_, index) => ({
      ...requestRule(`cached-${index}`, `^/cache/${index}$`),
      match: { url: `^/cache/${index}$`, type: 'regex' as const },
    }))

    expect(selectV3Rule([rules[0]], { url: '/cache/0', method: 'GET' })?.rule).toBe(rules[0])
    expect(selectV3Rule([rules[0]], { url: '/cache/0', method: 'GET' })?.rule).toBe(rules[0])
    for (let index = 1; index < rules.length; index += 1) {
      expect(selectV3Rule([rules[index]], { url: `/cache/${index}`, method: 'GET' })?.rule).toBe(
        rules[index]
      )
    }
    expect(selectV3Rule([rules[0]], { url: '/cache/0', method: 'GET' })?.rule).toBe(rules[0])
    expect(selectV3Rule([rules[1]], { url: '/cache/1', method: 'GET' })?.rule).toBe(rules[1])
  })

  it('matches exact URLs by case-sensitive full-string equality in runtime and preview', () => {
    const exactRule = {
      ...requestRule('exact', 'https://example.test/api?tenant=one'),
      match: {
        url: 'https://example.test/api?tenant=one',
        method: 'GET',
        type: 'exact' as const,
      },
    }
    const matchingRequest = { url: 'https://example.test/api?tenant=one', method: 'GET' }
    const nonMatchingRequests = [
      'https://example.test/prefix/api?tenant=one',
      'https://example.test/api/child?tenant=one',
      'https://example.test/api?tenant=two',
      'https://example.test/API?tenant=one',
    ]

    expect(selectV3Rule([exactRule], matchingRequest)?.rule).toBe(exactRule)
    for (const url of nonMatchingRequests) {
      expect(selectV3Rule([exactRule], { ...matchingRequest, url })).toBeUndefined()
    }
    expect(analyzeV3RuleMatches([exactRule], matchingRequest).results[0].reason).toBe('matched')
    expect(
      analyzeV3RuleMatches([exactRule], {
        ...matchingRequest,
        url: 'https://example.test/api?tenant=two',
      }).results[0].reason
    ).toBe('url-mismatch')
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

  it('classifies malformed runtime matchers and continues to the next rule', () => {
    const invalidTypeRule = {
      ...requestRule('invalid-type', '/api'),
      match: { url: '/api', type: 'prefix' as unknown as 'normal' },
    }
    const oversizedRegexRule = {
      ...requestRule('oversized-regex', 'x'.repeat(4097)),
      match: { url: 'x'.repeat(4097), type: 'regex' as const },
    }
    const throwingMatcherRule = {
      ...requestRule('throwing-matcher', '/api'),
      match: Object.defineProperty({ url: '/api' }, 'type', {
        get() {
          throw new Error('malformed matcher')
        },
      }),
    }
    const laterRule = requestRule('later', '/api')
    const rules = [invalidTypeRule, oversizedRegexRule, throwingMatcherRule, laterRule]

    expect(
      analyzeV3RuleMatches(rules, { url: '/api', method: 'GET' }).results.map(
        ({ reason }) => reason
      )
    ).toEqual(['invalid-match-type', 'invalid-regex', 'matcher-error', 'matched'])
    expect(selectV3Rule(rules, { url: '/api', method: 'GET' })?.rule).toBe(laterRule)
  })
})
