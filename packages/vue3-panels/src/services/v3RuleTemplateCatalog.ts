import type { V3Rule } from '@proxy/v3-domain'

export interface V3RuleTemplate {
  readonly templateId: string
  readonly titleKey: string
  readonly descriptionKey: string
  readonly rule: V3Rule
}

const catalog: readonly V3RuleTemplate[] = [
  {
    templateId: 'static-json-response',
    titleKey: 'ruleTemplates.static-json-response.title',
    descriptionKey: 'ruleTemplates.static-json-response.description',
    rule: {
      id: 'template-static-json-response',
      enabled: false,
      match: {
        url: 'https://api.example.invalid/placeholder',
        method: 'GET',
        type: 'normal',
      },
      response: {
        enabled: true,
        replace: {
          status: 200,
          body: { placeholder: true, message: 'Replace this example payload.' },
        },
      },
    },
  },
  {
    templateId: 'static-http-redirect',
    titleKey: 'ruleTemplates.static-http-redirect.title',
    descriptionKey: 'ruleTemplates.static-http-redirect.description',
    rule: {
      id: 'template-static-http-redirect',
      enabled: false,
      match: {
        url: 'https://source.example.invalid/placeholder',
        method: 'GET',
        type: 'normal',
      },
      request: {
        enabled: true,
        redirect: { url: 'https://target.example.invalid/placeholder' },
      },
    },
  },
]

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

/** Immutable built-in examples. Use cloneV3RuleTemplate before editing a draft. */
export const V3_RULE_TEMPLATE_CATALOG: readonly V3RuleTemplate[] = deepFreeze(catalog)

/** Return an isolated editable rule draft, or undefined when the template ID is unknown. */
export function cloneV3RuleTemplate(templateId: string): V3Rule | undefined {
  const template = V3_RULE_TEMPLATE_CATALOG.find((item) => item.templateId === templateId)
  return template ? (JSON.parse(JSON.stringify(template.rule)) as V3Rule) : undefined
}
