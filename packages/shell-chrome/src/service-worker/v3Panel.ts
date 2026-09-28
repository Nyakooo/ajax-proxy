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

const EMPTY_CONFIG_REVISION = 'empty-v3-config'
let saveQueue: Promise<void> = Promise.resolve()

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])])
  )
}

async function getConfigRevision(config: unknown | null): Promise<string> {
  if (config === null) return EMPTY_CONFIG_REVISION
  const canonicalJson = JSON.stringify(canonicalize(config))
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson)
  )
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function serializeConfigSave<T>(save: () => Promise<T>): Promise<T> {
  const result = saveQueue.then(save, save)
  saveQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
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
      return {
        ok: true,
        snapshot: { config: null, hitCounters: {}, revision: EMPTY_CONFIG_REVISION },
      }
    }

    const validation = validateV3Backup(storedConfig)
    if (!validation.ok) return { ok: false, issues: validation.issues }

    const storedCounters = await storage.read(StorageKey.V3_HITS, {})
    const revision = await getConfigRevision(validation.data)
    return {
      ok: true,
      snapshot: {
        config: validation.data,
        hitCounters: sanitizeV3HitCounters(storedCounters, validation.data),
        revision,
      },
    }
  } catch {
    return { ok: false, error: 'storage-read-failed' }
  }
}

/** Validate V3 backups before saving. `null` explicitly clears only V3 storage. */
export async function saveV3PanelConfig(
  value: unknown,
  expectedRevision: string,
  storage: V3PanelStorage = extensionStorage
): Promise<V3PanelSaveConfigResponse> {
  return serializeConfigSave(async () => {
    const validation = value === null ? null : validateV3Backup(value)
    if (validation && !validation.ok) return { ok: false, issues: validation.issues }
    const nextConfig = validation?.data ?? null

    let currentConfig: unknown | null
    let currentRevision: string
    try {
      const storedConfig = await storage.read(StorageKey.V3_CONFIG, null)
      if (storedConfig === null) currentConfig = null
      else {
        const currentValidation = validateV3Backup(storedConfig)
        if (!currentValidation.ok) return { ok: false, issues: currentValidation.issues }
        currentConfig = currentValidation.data
      }
      currentRevision = await getConfigRevision(currentConfig)
    } catch {
      return { ok: false, error: 'storage-read-failed' }
    }
    if (currentRevision !== expectedRevision) {
      return {
        ok: false,
        error: 'config-conflict',
        current: { config: currentConfig, revision: currentRevision },
      }
    }
    try {
      await storage.write(StorageKey.V3_CONFIG, nextConfig)
      return { ok: true, revision: await getConfigRevision(nextConfig) }
    } catch {
      return { ok: false, error: 'storage-write-failed' }
    }
  })
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
      void saveV3PanelConfig(config, message.value.expectedRevision, storage).then(sendResponse)
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
