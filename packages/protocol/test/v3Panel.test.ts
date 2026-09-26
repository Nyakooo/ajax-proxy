import { describe, expect, it, vi } from 'vitest'
import {
  isV3PanelGetSnapshotRequest,
  isV3PanelMessage,
  isV3PanelSaveConfigRequest,
  NoticeFrom,
  NoticeKey,
  NoticeTo,
  V3PanelMessageKey,
} from '../src'

const getSnapshotMessage = {
  from: NoticeFrom.PANELS,
  to: NoticeTo.SERVICE_WORKER,
  key: V3PanelMessageKey.GET_SNAPSHOT,
}

const saveConfigMessage = {
  from: NoticeFrom.PANELS,
  to: NoticeTo.SERVICE_WORKER,
  key: V3PanelMessageKey.SAVE_CONFIG,
  value: { config: null, expectedRevision: 'empty-v3-config' },
}

describe('V3 panel message guard', () => {
  it('accepts exact GET_SNAPSHOT and SAVE_CONFIG envelopes', () => {
    expect(isV3PanelGetSnapshotRequest(getSnapshotMessage)).toBe(true)
    expect(isV3PanelSaveConfigRequest(saveConfigMessage)).toBe(true)
    expect(isV3PanelMessage(getSnapshotMessage)).toBe(true)
    expect(isV3PanelMessage(saveConfigMessage)).toBe(true)
    expect(
      isV3PanelMessage({
        ...saveConfigMessage,
        value: { config: undefined, expectedRevision: 'empty-v3-config' },
      })
    ).toBe(true)
  })

  it('rejects extra or missing top-level fields', () => {
    expect(isV3PanelMessage({ ...getSnapshotMessage, value: null })).toBe(false)
    expect(isV3PanelMessage({ ...getSnapshotMessage, extra: true })).toBe(false)
    expect(isV3PanelMessage({ ...saveConfigMessage, extra: true })).toBe(false)
    expect(isV3PanelMessage({ from: getSnapshotMessage.from, to: getSnapshotMessage.to })).toBe(
      false
    )
  })

  it('rejects wrong routing values and unknown keys', () => {
    expect(isV3PanelMessage({ ...getSnapshotMessage, from: NoticeFrom.CONTENT })).toBe(false)
    expect(isV3PanelMessage({ ...getSnapshotMessage, to: NoticeTo.CONTENT })).toBe(false)
    expect(isV3PanelMessage({ ...getSnapshotMessage, key: NoticeKey.V3_CONFIG })).toBe(false)
  })

  it('requires SAVE_CONFIG value to include only config and a string revision', () => {
    expect(isV3PanelMessage({ ...saveConfigMessage, value: null })).toBe(false)
    expect(isV3PanelMessage({ ...saveConfigMessage, value: [] })).toBe(false)
    expect(isV3PanelMessage({ ...saveConfigMessage, value: {} })).toBe(false)
    expect(
      isV3PanelMessage({
        ...saveConfigMessage,
        value: { config: null, expectedRevision: 'empty-v3-config', extra: true },
      })
    ).toBe(false)
    expect(
      isV3PanelMessage({ ...saveConfigMessage, value: { config: null, expectedRevision: 42 } })
    ).toBe(false)
    expect(
      isV3PanelMessage({
        ...saveConfigMessage,
        value: Object.assign(Object.create({ inherited: true }), {
          config: null,
          expectedRevision: 'empty-v3-config',
        }),
      })
    ).toBe(false)
  })

  it('rejects arrays, class instances, and hostile proxies', () => {
    class Message {
      from = getSnapshotMessage.from
      to = getSnapshotMessage.to
      key = getSnapshotMessage.key
    }

    expect(isV3PanelMessage(null)).toBe(false)
    expect(isV3PanelMessage([])).toBe(false)
    expect(isV3PanelMessage(new Message())).toBe(false)
    expect(
      isV3PanelMessage(
        new Proxy(
          {},
          {
            getPrototypeOf: () => {
              throw new Error('blocked')
            },
          }
        )
      )
    ).toBe(false)
  })

  it('rejects accessor routing fields and config without invoking their getters', () => {
    const getKey = vi.fn(() => V3PanelMessageKey.GET_SNAPSHOT)
    const getConfig = vi.fn(() => null)
    const accessorGet = { ...getSnapshotMessage }
    Object.defineProperty(accessorGet, 'key', { enumerable: true, get: getKey })
    const accessorSave = {
      ...saveConfigMessage,
      value: Object.defineProperties(
        {},
        {
          config: { enumerable: true, get: getConfig },
          expectedRevision: { enumerable: true, value: 'empty-v3-config' },
        }
      ),
    }

    expect(isV3PanelGetSnapshotRequest(accessorGet)).toBe(false)
    expect(isV3PanelSaveConfigRequest(accessorSave)).toBe(false)
    expect(getKey).not.toHaveBeenCalled()
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('reads valid proxy messages through descriptors without invoking get traps', () => {
    const get = vi.fn()
    const descriptorTrap = vi.fn((target: object, key: PropertyKey) =>
      Reflect.getOwnPropertyDescriptor(target, key)
    )
    const proxied = new Proxy(getSnapshotMessage, {
      get,
      getOwnPropertyDescriptor: descriptorTrap,
    })

    expect(isV3PanelGetSnapshotRequest(proxied)).toBe(true)
    expect(get).not.toHaveBeenCalled()
    expect(descriptorTrap).toHaveBeenCalled()

    const hostileDescriptor = new Proxy(getSnapshotMessage, {
      getOwnPropertyDescriptor() {
        throw new Error('descriptor access blocked')
      },
    })
    expect(isV3PanelGetSnapshotRequest(hostileDescriptor)).toBe(false)
  })
})
