import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BackupRestoreDialog from '../src/components/BackupRestoreDialog.vue'
import { i18n } from '../src/i18n/index.js'

const backupWithFunctionRule = {
  format: 'ajax-proxy-backup',
  formatVersion: 3,
  settings: { globalEnabled: true, mode: 'interceptor', language: 'zh-CN' },
  tags: [],
  rules: [
    {
      id: 'imported-function',
      enabled: true,
      match: { url: '/api', method: 'POST', type: 'normal' },
      response: { enabled: true, replace: { code: 'return { body: "mock" }' } },
    },
  ],
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('BackupRestoreDialog', () => {
  it('requires confirmation before restoring function rules and emits normalized backup data', async () => {
    const wrapper = mount(BackupRestoreDialog, {
      props: { open: true, backup: { rules: [], tags: [] } },
      global: { plugins: [i18n] },
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper
      .get('[data-testid="backup-json-input"]')
      .setValue(JSON.stringify(backupWithFunctionRule))
    await wrapper.get('.backup-actions button:nth-child(2)').trigger('click')

    const restoreButton = wrapper.get('[data-testid="backup-restore-button"]')
    expect(restoreButton.attributes('disabled')).toBeUndefined()
    await restoreButton.trigger('click')
    expect(confirm).toHaveBeenCalledOnce()
    expect(wrapper.emitted('restore')).toBeUndefined()

    confirm.mockReturnValue(true)
    await restoreButton.trigger('click')
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('restore')).toEqual([
      [
        {
          ...backupWithFunctionRule,
          formatVersion: 5,
          disabledOrigins: [],
          rules: [
            {
              ...backupWithFunctionRule.rules[0],
              response: {
                ...backupWithFunctionRule.rules[0].response,
                enabled: false,
              },
            },
          ],
        },
      ],
    ])
  })

  it('invalidates the preview and disables restore after editing the source', async () => {
    const wrapper = mount(BackupRestoreDialog, {
      props: { open: true, backup: { rules: [], tags: [] } },
      global: { plugins: [i18n] },
    })
    await wrapper
      .get('[data-testid="backup-json-input"]')
      .setValue(JSON.stringify(backupWithFunctionRule))
    await wrapper.get('.backup-actions button:nth-child(2)').trigger('click')
    expect(
      wrapper.get('[data-testid="backup-restore-button"]').attributes('disabled')
    ).toBeUndefined()

    await wrapper.get('[data-testid="backup-json-input"]').setValue('{"changed":true}')

    expect(
      wrapper.get('[data-testid="backup-restore-button"]').attributes('disabled')
    ).toBeDefined()
    expect(
      wrapper.get('[data-testid="backup-import-rules-button"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.find('.backup-valid').exists()).toBe(false)
  })

  it('blocks rule import when a referenced tag ID has a different name', async () => {
    const importedTag = { id: 'tag-1', name: 'Imported label', used: true }
    const backupWithTaggedRule = {
      ...backupWithFunctionRule,
      tags: [importedTag],
      rules: [
        {
          ...backupWithFunctionRule.rules[0],
          id: 'tagged-rule',
          tagIds: ['tag-1'],
          response: { enabled: true, replace: { body: 'mock' } },
        },
      ],
    }
    const wrapper = mount(BackupRestoreDialog, {
      props: {
        open: true,
        backup: {
          rules: [],
          tags: [{ id: 'tag-1', name: 'Current label', used: true }],
        },
      },
      global: { plugins: [i18n] },
    })
    await wrapper
      .get('[data-testid="backup-json-input"]')
      .setValue(JSON.stringify(backupWithTaggedRule))
    await wrapper.get('.backup-actions button:nth-child(2)').trigger('click')

    const importButton = wrapper.get('[data-testid="backup-import-rules-button"]')
    expect(wrapper.get('[role="alert"]').text()).toContain('tag-1')
    expect(importButton.attributes('disabled')).toBeDefined()
    await importButton.trigger('click')
    expect(wrapper.emitted('import-rules')).toBeUndefined()

    await wrapper.setProps({
      backup: {
        rules: [],
        tags: [{ id: 'tag-1', name: 'Imported label', used: true }],
      },
    })
    expect(importButton.attributes('disabled')).toBeUndefined()
    await importButton.trigger('click')
    expect(wrapper.emitted('import-rules')).toHaveLength(1)
    expect(wrapper.emitted('import-rules')?.[0]?.[0]).toMatchObject({
      formatVersion: 5,
      disabledOrigins: [],
      rules: [{ id: 'tagged-rule', tagIds: ['tag-1'] }],
    })
  })
})
