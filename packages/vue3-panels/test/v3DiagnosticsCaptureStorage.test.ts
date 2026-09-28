import { describe, expect, it, vi } from 'vitest'
import { StorageKey } from '@proxy/protocol'
import { createV3DiagnosticsCaptureStorage } from '../src/services/v3DiagnosticsCaptureStorage.js'

function createStorage(initial = {}) {
  const listeners = new Set()
  const local = {
    get: vi.fn(async () => initial),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  }
  const onChanged = {
    addListener: vi.fn((listener) => listeners.add(listener)),
    removeListener: vi.fn((listener) => listeners.delete(listener)),
  }

  return {
    storage: { local, onChanged },
    local,
    onChanged,
    emit(changes, areaName = 'local') {
      for (const listener of listeners) listener(changes, areaName)
    },
  }
}

describe('V3 diagnostics capture storage', () => {
  it('loads only enabled capture preferences as armed', async () => {
    const harness = createStorage({
      [StorageKey.V3_DIAGNOSTICS_ARMED]: true,
      [StorageKey.V3_FETCH_OUTCOMES_ARMED]: 'true',
    })
    const service = createV3DiagnosticsCaptureStorage(harness.storage)

    await expect(service.getState()).resolves.toEqual({
      noMatchCaptureArmed: true,
      fetchOutcomeCaptureArmed: false,
    })
    expect(harness.local.get).toHaveBeenCalledWith([
      StorageKey.V3_DIAGNOSTICS_ARMED,
      StorageKey.V3_FETCH_OUTCOMES_ARMED,
    ])
  })

  it('adds and removes each capture preference through its storage key', async () => {
    const harness = createStorage()
    const service = createV3DiagnosticsCaptureStorage(harness.storage)

    await service.setNoMatchCaptureArmed(true)
    await service.setNoMatchCaptureArmed(false)
    await service.setFetchOutcomeCaptureArmed(true)
    await service.setFetchOutcomeCaptureArmed(false)

    expect(harness.local.set).toHaveBeenNthCalledWith(1, {
      [StorageKey.V3_DIAGNOSTICS_ARMED]: true,
    })
    expect(harness.local.remove).toHaveBeenNthCalledWith(1, StorageKey.V3_DIAGNOSTICS_ARMED)
    expect(harness.local.set).toHaveBeenNthCalledWith(2, {
      [StorageKey.V3_FETCH_OUTCOMES_ARMED]: true,
    })
    expect(harness.local.remove).toHaveBeenNthCalledWith(2, StorageKey.V3_FETCH_OUTCOMES_ARMED)
  })

  it('notifies only for local capture-key changes and supports cleanup', () => {
    const harness = createStorage()
    const service = createV3DiagnosticsCaptureStorage(harness.storage)
    const listener = vi.fn()
    const remove = service.subscribe(listener)

    harness.emit({ [StorageKey.V3_DIAGNOSTICS_ARMED]: { newValue: true } }, 'sync')
    harness.emit({ unrelated: { newValue: true } })
    harness.emit({
      [StorageKey.V3_DIAGNOSTICS_ARMED]: { newValue: false },
      [StorageKey.V3_FETCH_OUTCOMES_ARMED]: { newValue: true },
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({
      noMatchCaptureArmed: false,
      fetchOutcomeCaptureArmed: true,
    })
    remove()
    harness.emit({ [StorageKey.V3_DIAGNOSTICS_ARMED]: { newValue: true } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(harness.onChanged.removeListener).toHaveBeenCalledTimes(1)
  })

  it('does not read or subscribe when storage is unavailable', async () => {
    const service = createV3DiagnosticsCaptureStorage(null)

    expect(service.available).toBe(false)
    expect(service.canObserveChanges).toBe(false)
    await expect(service.getState()).resolves.toBeNull()
    const remove = service.subscribe(vi.fn())
    expect(remove()).toBeUndefined()
  })

  it('keeps writes available when local storage has no change event API', async () => {
    const harness = createStorage()
    const service = createV3DiagnosticsCaptureStorage({ local: harness.local })

    expect(service.available).toBe(true)
    expect(service.canObserveChanges).toBe(false)
    await service.setNoMatchCaptureArmed(true)
    expect(harness.local.set).toHaveBeenCalledWith({
      [StorageKey.V3_DIAGNOSTICS_ARMED]: true,
    })
    await expect(service.getState()).resolves.toBeNull()
  })
})
