import { expect, it } from 'vitest'
import { resolveV3RedirectTarget } from '../src/ruleMatcher'
import type { V3Rule } from '../src/rules'
const rule: V3Rule = {
  id: 'redirect',
  enabled: true,
  match: { type: 'regex', url: '^https://source.test/api/(?P<path>[^?]+)(.*)$' },
}
it.each([
  ['https://target.test/$1$2', 'https://target.test/users?page=1'],
  ['https://target.test/$<path>$2', 'https://target.test/users?page=1'],
  ['https://target.test/$$1', 'https://target.test/$1'],
  ['https://target.test/fixed', 'https://target.test/fixed'],
])('resolves %s', (target, expected) => {
  expect(resolveV3RedirectTarget(rule, 'https://source.test/api/users?page=1', target)).toBe(
    expected
  )
})
it('keeps normal and exact destinations literal and fails open on invalid regex', () => {
  for (const type of ['normal', 'exact'] as const) {
    expect(
      resolveV3RedirectTarget(
        { ...rule, match: { url: '/api', type } },
        'https://source.test/api',
        '/$1'
      )
    ).toBe('/$1')
  }
  expect(
    resolveV3RedirectTarget(
      { ...rule, match: { type: 'regex', url: '[' } },
      'https://source.test/api',
      '/$1'
    )
  ).toBeUndefined()
})
