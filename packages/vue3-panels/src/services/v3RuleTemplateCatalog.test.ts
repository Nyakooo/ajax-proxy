import { describe, expect, it } from 'vitest'
import { cloneV3RuleTemplate, V3_RULE_TEMPLATE_CATALOG } from './v3RuleTemplateCatalog.js'

describe('V3 rule template catalog', () => {
  it('provides exactly the static response and HTTP(S) redirect templates', () => {
    expect(V3_RULE_TEMPLATE_CATALOG.map(({ templateId }) => templateId)).toEqual([
      'static-json-response',
      'static-http-redirect',
    ])
    expect(
      V3_RULE_TEMPLATE_CATALOG.map(({ titleKey, descriptionKey }) => [titleKey, descriptionKey])
    ).toEqual([
      [
        'ruleTemplates.static-json-response.title',
        'ruleTemplates.static-json-response.description',
      ],
      [
        'ruleTemplates.static-http-redirect.title',
        'ruleTemplates.static-http-redirect.description',
      ],
    ])
  })

  it('uses disabled rules and reserved example.invalid hosts only', () => {
    for (const { rule } of V3_RULE_TEMPLATE_CATALOG) {
      expect(rule.enabled).toBe(false)
      expect(rule.id).toMatch(/^template-/)
      expect(rule.match.url).toMatch(/^https:\/\//)
      expect(new URL(rule.match.url).hostname).toMatch(/\.invalid$/)
      if (rule.request) {
        expect(rule.request.redirect.url).toMatch(/^https:\/\//)
        expect(new URL(rule.request.redirect.url).hostname).toMatch(/\.invalid$/)
      }
    }
  })

  it('contains only static actions and explicit placeholder response data', () => {
    const response = V3_RULE_TEMPLATE_CATALOG[0].rule
    expect(response.response?.replace).toEqual({
      status: 200,
      body: { placeholder: true, message: 'Replace this example payload.' },
    })
    const serialized = JSON.stringify(V3_RULE_TEMPLATE_CATALOG)
    expect(serialized).not.toMatch(/"code"\s*:/)
    expect(serialized).not.toMatch(/example\.(com|net|org)/i)
  })

  it('returns deep-isolated editable drafts and handles unknown IDs', () => {
    const first = cloneV3RuleTemplate('static-json-response')
    const second = cloneV3RuleTemplate('static-json-response')
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    if (!first?.response?.replace.body || typeof first.response.replace.body !== 'object') {
      throw new Error('Expected an object placeholder body')
    }
    ;(first.response.replace.body as Record<string, unknown>).placeholder = false
    expect(second?.response?.replace.body).toEqual({
      placeholder: true,
      message: 'Replace this example payload.',
    })
    expect(cloneV3RuleTemplate('missing-template')).toBeUndefined()
    expect(Object.isFrozen(V3_RULE_TEMPLATE_CATALOG[0].rule)).toBe(true)
  })
})
