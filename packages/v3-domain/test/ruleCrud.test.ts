import { describe, expect, it } from 'vitest'
import {
  appendV3Rule,
  deleteV3Rule,
  insertV3Rule,
  moveV3Rule,
  replaceV3Rule,
  setV3RuleEnabled,
} from '../src'
import type { V3Rule } from '../src'

const rule = (id: string, enabled = true): V3Rule => ({
  id,
  enabled,
  match: { url: `/${id}` },
  request: { enabled: true, redirect: { url: '/target' } },
})

describe('V3 rule collection CRUD', () => {
  it('appends and inserts without mutating the input and clamps invalid indexes', () => {
    const first = rule('first')
    const last = rule('last')
    const rules = [first, last]

    const appended = appendV3Rule(rules, rule('appended'))
    expect(appended.map(({ id }) => id)).toEqual(['first', 'last', 'appended'])
    expect(rules).toEqual([first, last])
    expect(insertV3Rule(rules, rule('start'), -20).map(({ id }) => id)).toEqual([
      'start',
      'first',
      'last',
    ])
    expect(insertV3Rule(rules, rule('end'), Number.NaN).map(({ id }) => id)).toEqual([
      'first',
      'last',
      'end',
    ])
    expect(insertV3Rule(rules, rule('middle'), 1).map(({ id }) => id)).toEqual([
      'first',
      'middle',
      'last',
    ])
  })

  it('rejects duplicate IDs by returning the original array unchanged', () => {
    const rules = [rule('first'), rule('second')]
    expect(appendV3Rule(rules, rule('first'))).toBe(rules)
    expect(insertV3Rule(rules, rule('second'), 0)).toBe(rules)
    expect(replaceV3Rule(rules, 'first', rule('second'))).toBe(rules)
  })

  it('replaces by ID, including a unique ID change, while unknown IDs are no-ops', () => {
    const rules = [rule('first'), rule('second')]
    const replacement = rule('renamed', false)
    const changed = replaceV3Rule(rules, 'first', replacement)
    expect(changed).not.toBe(rules)
    expect(changed).toEqual([replacement, rules[1]])
    expect(rules[0].id).toBe('first')
    expect(replaceV3Rule(rules, 'missing', rule('replacement'))).toBe(rules)
  })

  it('deletes by ID and leaves unknown IDs untouched', () => {
    const rules = [rule('first'), rule('second')]
    expect(deleteV3Rule(rules, 'first')).toEqual([rules[1]])
    expect(deleteV3Rule(rules, 'missing')).toBe(rules)
    expect(rules.map(({ id }) => id)).toEqual(['first', 'second'])
  })

  it('changes enabled state immutably and no-ops for unknown or unchanged state', () => {
    const rules = [rule('first'), rule('second')]
    const changed = setV3RuleEnabled(rules, 'first', false)
    expect(changed).toEqual([rule('first', false), rules[1]])
    expect(changed[0]).not.toBe(rules[0])
    expect(changed[1]).toBe(rules[1])
    expect(setV3RuleEnabled(rules, 'first', true)).toBe(rules)
    expect(setV3RuleEnabled(rules, 'missing', false)).toBe(rules)
  })

  it('moves rules to determine priority and clamps target indexes', () => {
    const rules = [rule('first'), rule('second'), rule('third')]
    expect(moveV3Rule(rules, 'third', 0).map(({ id }) => id)).toEqual(['third', 'first', 'second'])
    expect(moveV3Rule(rules, 'first', 100).map(({ id }) => id)).toEqual([
      'second',
      'third',
      'first',
    ])
    expect(moveV3Rule(rules, 'first', Number.NaN).map(({ id }) => id)).toEqual([
      'second',
      'third',
      'first',
    ])
    expect(moveV3Rule(rules, 'missing', 1)).toBe(rules)
    expect(moveV3Rule(rules, 'second', 1)).toBe(rules)
    expect(rules.map(({ id }) => id)).toEqual(['first', 'second', 'third'])
  })
})
