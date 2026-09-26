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
})
