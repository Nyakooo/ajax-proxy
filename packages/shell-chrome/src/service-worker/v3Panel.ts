import {
  isV3PanelGetSnapshotRequest,
  isV3PanelMessage,
  isV3PanelSaveConfigRequest,
} from '@proxy/protocol'
import type { V3PanelGetSnapshotResponse, V3PanelSaveConfigResponse } from '@proxy/protocol'
import { StorageKey, getRealStorage, setStorage } from '@proxy/shared-utils'
import { sanitizeV3HitCounters, validateV3Backup } from '@proxy/v3-domain'

export interface V3PanelStorage {
  read(key: StorageKey, defaultValue: unknown): Promise<unknown>
  write(key: StorageKey, value: unknown): Promise<void>
}

const extensionStorage: V3PanelStorage = {
  read: getRealStorage,
  write: setStorage,
}

/** Read a V3-only snapshot and validate it before exposing it to the panel. */
export async function readV3PanelSnapshot(
  storage: V3PanelStorage = extensionStorage
): Promise<V3PanelGetSnapshotResponse> {
  try {
    const storedConfig = await storage.read(StorageKey.V3_CONFIG, null)
    if (storedConfig === null) {
      return { ok: true, snapshot: { config: null, hitCounters: {} } }
    }

    const validation = validateV3Backup(storedConfig)
    if (!validation.ok) return { ok: false, issues: validation.issues }

    const storedCounters = await storage.read(StorageKey.V3_HITS, {})
    return {
      ok: true,
      snapshot: {
        config: validation.data,
        hitCounters: sanitizeV3HitCounters(storedCounters, validation.data),
      },
    }
  } catch {
    return { ok: false, error: 'storage-read-failed' }
  }
}

/** Validate V3 backups before saving. `null` explicitly clears only V3 storage. */
export async function saveV3PanelConfig(
  value: unknown,
  storage: V3PanelStorage = extensionStorage
): Promise<V3PanelSaveConfigResponse> {
  if (value === null) {
    try {
      await storage.write(StorageKey.V3_CONFIG, null)
      return { ok: true }
    } catch {
      return { ok: false, error: 'storage-write-failed' }
    }
  }

  const validation = validateV3Backup(value)
  if (!validation.ok) return { ok: false, issues: validation.issues }

  try {
    await storage.write(StorageKey.V3_CONFIG, validation.data)
    return { ok: true }
  } catch {
    return { ok: false, error: 'storage-write-failed' }
  }
}

export interface V3PanelMessageSender {
  id?: string
  tab?: unknown
  url?: string
}

/**
 * Handle the two V3 panel requests without sharing or modifying V2 storage.
 * Extension pages opened in tabs may include sender.tab, so authenticate them
 * by extension ID and the dedicated V3 page URL instead.
 */
export function createV3PanelMessageHandler(options: {
  extensionId: string
  extensionUrl: string
  storage?: V3PanelStorage
  sendResponse: (response: unknown) => void
}) {
  const storage = options.storage ?? extensionStorage

  return (
    message: unknown,
    sender: V3PanelMessageSender,
    sendResponse = options.sendResponse
  ): boolean => {
    if (
      sender.id !== options.extensionId ||
      typeof sender.url !== 'string' ||
      !sender.url.startsWith(`${options.extensionUrl}panels-v3/`)
    ) {
      return false
    }

    if (isV3PanelGetSnapshotRequest(message)) {
      void readV3PanelSnapshot(storage).then(sendResponse)
      return true
    }
    if (isV3PanelSaveConfigRequest(message)) {
      const config = message.value.config
      void saveV3PanelConfig(config, storage).then(sendResponse)
      return true
    }
    return false
  }
}

/**
 * Registerable MV3 startup adapter. The listener itself is installed before
 * asynchronous storage initialization; accepted requests wait for that
 * initialization before using the regular panel handler.
 */
export function createV3PanelStartupMessageHandler(options: {
  extensionId: string
  extensionUrl: string
  storageReady: Promise<unknown>
  storage?: V3PanelStorage
}) {
  const handlePanelMessage = (
    message: unknown,
    sender: V3PanelMessageSender,
    sendResponse: (response: unknown) => void
  ) => createV3PanelMessageHandler({ ...options, sendResponse })(message, sender, sendResponse)

  return (
    message: unknown,
    sender: V3PanelMessageSender,
    sendResponse: (response: unknown) => void
  ): boolean => {
    if (
      !isV3PanelMessage(message) ||
      sender.id !== options.extensionId ||
      typeof sender.url !== 'string' ||
      !sender.url.startsWith(`${options.extensionUrl}panels-v3/`)
    ) {
      return false
    }

    void options.storageReady
      .then(() => handlePanelMessage(message, sender, sendResponse))
      .catch(() => {
        sendResponse(
          isV3PanelGetSnapshotRequest(message)
            ? { ok: false, error: 'storage-read-failed' }
            : { ok: false, error: 'storage-write-failed' }
        )
      })
    return true
  }
}
