import { describe, expect, it } from 'vitest'
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
  value: { config: null },
}

describe('V3 panel message guard', () => {
  it('accepts exact GET_SNAPSHOT and SAVE_CONFIG envelopes', () => {
    expect(isV3PanelGetSnapshotRequest(getSnapshotMessage)).toBe(true)
    expect(isV3PanelSaveConfigRequest(saveConfigMessage)).toBe(true)
    expect(isV3PanelMessage(getSnapshotMessage)).toBe(true)
    expect(isV3PanelMessage(saveConfigMessage)).toBe(true)
    expect(isV3PanelMessage({ ...saveConfigMessage, value: { config: undefined } })).toBe(true)
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

  it('requires SAVE_CONFIG value to be a plain object with config only', () => {
    expect(isV3PanelMessage({ ...saveConfigMessage, value: null })).toBe(false)
    expect(isV3PanelMessage({ ...saveConfigMessage, value: [] })).toBe(false)
    expect(isV3PanelMessage({ ...saveConfigMessage, value: {} })).toBe(false)
    expect(isV3PanelMessage({ ...saveConfigMessage, value: { config: null, extra: true } })).toBe(
      false
    )
    expect(
      isV3PanelMessage({
        ...saveConfigMessage,
        value: Object.assign(Object.create({ inherited: true }), { config: null }),
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
})
