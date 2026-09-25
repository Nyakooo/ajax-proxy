import { describe, expect, it } from 'vitest'
import { formatV3ValidationIssues, parseV3BackupJson, validateV3Backup } from '../src'

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
        message: 'Expected an integer from 100 to 599.',
      })
    }
  })

  it('parses a JSON backup and returns readable syntax and field errors', () => {
    expect(parseV3BackupJson(`\uFEFF${JSON.stringify(validBackup)}`)).toMatchObject({ ok: true })
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
        'rules[0].match.url: Expected a non-empty string.'
      )
    }
  })
})
