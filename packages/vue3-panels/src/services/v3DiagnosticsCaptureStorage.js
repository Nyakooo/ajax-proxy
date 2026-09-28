import { StorageKey } from '@proxy/protocol'

const captureStorageKeys = [StorageKey.V3_DIAGNOSTICS_ARMED, StorageKey.V3_FETCH_OUTCOMES_ARMED]

function isArmed(value) {
  return value === true
}

export function createV3DiagnosticsCaptureStorage(storage = globalThis.chrome?.storage) {
  const local = storage?.local
  const onChanged = storage?.onChanged

  return {
    available: Boolean(local),
    canObserveChanges: Boolean(local && onChanged),

    async getState() {
      if (!local || !onChanged) return null
      const state = await local.get(captureStorageKeys)
      return {
        noMatchCaptureArmed: isArmed(state[StorageKey.V3_DIAGNOSTICS_ARMED]),
        fetchOutcomeCaptureArmed: isArmed(state[StorageKey.V3_FETCH_OUTCOMES_ARMED]),
      }
    },

    async setNoMatchCaptureArmed(armed) {
      if (!local) return
      if (armed) await local.set({ [StorageKey.V3_DIAGNOSTICS_ARMED]: true })
      else await local.remove(StorageKey.V3_DIAGNOSTICS_ARMED)
    },

    async setFetchOutcomeCaptureArmed(armed) {
      if (!local) return
      if (armed) await local.set({ [StorageKey.V3_FETCH_OUTCOMES_ARMED]: true })
      else await local.remove(StorageKey.V3_FETCH_OUTCOMES_ARMED)
    },

    subscribe(listener) {
      if (!onChanged) return () => {}

      const onStorageChanged = (changes, areaName) => {
        if (areaName !== 'local') return

        const state = {}
        if (Object.hasOwn(changes, StorageKey.V3_DIAGNOSTICS_ARMED)) {
          state.noMatchCaptureArmed = isArmed(changes[StorageKey.V3_DIAGNOSTICS_ARMED].newValue)
        }
        if (Object.hasOwn(changes, StorageKey.V3_FETCH_OUTCOMES_ARMED)) {
          state.fetchOutcomeCaptureArmed = isArmed(
            changes[StorageKey.V3_FETCH_OUTCOMES_ARMED].newValue
          )
        }

        if (Object.keys(state).length) listener(state)
      }

      onChanged.addListener(onStorageChanged)
      return () => onChanged.removeListener(onStorageChanged)
    },
  }
}
