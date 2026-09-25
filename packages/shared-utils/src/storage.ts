import { StorageKey } from './consts'
import { useStorage } from './env'

// chrome.storage.sync.set 大于8,192字节的数据时，会报错 -> QUOTA_BYTES_PER_ITEM quota exceeded
// chrome.storage.local.set可以包含5242880

let storageData
let storageChangeListenerRegistered = false
type StorageChanges = Record<string, chrome.storage.StorageChange>
let pendingStorageChanges: StorageChanges[] = []
const STORAGE_ERROR_EVENT = 'ajax-proxy:storage-error'

function getStorageApiError(operation: string, key?: string) {
  const message = chrome.runtime?.lastError?.message
  if (!message) return undefined
  return new Error(`Storage ${operation}${key ? ` (${key})` : ''} failed: ${message}`)
}

function reportStorageError(error: unknown, operation: string, key?: string) {
  const storageError = error instanceof Error ? error : new Error(String(error))
  console.error('[AjaxProxy] Storage operation failed', storageError)
  try {
    const event = new CustomEvent(STORAGE_ERROR_EVENT, {
      detail: { operation, key, message: storageError.message },
    })
    globalThis.dispatchEvent?.(event)
  } catch (eventError) {
    console.error('[AjaxProxy] Could not dispatch storage error event', eventError)
  }
}

function reportRejectedStorageOperation<T>(
  operationPromise: Promise<T>,
  operation: string,
  key?: string
) {
  void operationPromise.catch((error) => reportStorageError(error, operation, key))
  return operationPromise
}

function applyStorageChanges(changes: StorageChanges) {
  for (const [key, change] of Object.entries(changes)) {
    if (change.newValue === undefined) delete storageData[key]
    else storageData[key] = change.newValue
  }
}

function handleStorageChanged(changes: StorageChanges, areaName: string) {
  if (areaName !== 'local') return
  if (!storageData) {
    pendingStorageChanges.push(changes)
    return
  }
  applyStorageChanges(changes)
}

export function initStorage(): Promise<void> {
  const operation = new Promise<void>((resolve, reject) => {
    if (useStorage) {
      if (!storageChangeListenerRegistered) {
        chrome.storage.onChanged.addListener(handleStorageChanged)
        storageChangeListenerRegistered = true
      }
      chrome.storage.local.get(null, (result) => {
        const error = getStorageApiError('read')
        if (error) {
          reject(error)
          return
        }
        storageData = result || {}
        for (const changes of pendingStorageChanges) applyStorageChanges(changes)
        pendingStorageChanges = []
        resolve()
      })
    } else {
      storageData = {}
      resolve()
    }
  })
  return reportRejectedStorageOperation(operation, 'initialize')
}

export function getStorage(key: string, defaultValue: any = null) {
  checkStorage()
  if (useStorage) {
    return getDefaultValue(storageData[key], defaultValue)
  } else {
    try {
      return getDefaultValue(JSON.parse(localStorage.getItem(key) as any), defaultValue)
    } catch (error) {
      reportStorageError(error, 'read', key)
      return defaultValue
    }
  }
}

/**不走缓存获取数据 */
export function getRealStorage(key: StorageKey, defaultValue: any = null) {
  if (useStorage) {
    const operation = new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        const error = getStorageApiError('read', key)
        if (error) {
          reject(error)
          return
        }
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          storageData[key] = result[key]
          resolve(getDefaultValue(result[key], defaultValue))
        } else {
          delete storageData[key]
          resolve(defaultValue)
        }
      })
    })
    return reportRejectedStorageOperation(operation, 'read', key)
  } else {
    try {
      const result = getDefaultValue(JSON.parse(localStorage.getItem(key) as any), defaultValue)
      return Promise.resolve(result)
    } catch (error) {
      return reportRejectedStorageOperation(Promise.reject(error), 'read', key)
    }
  }
}

export function setStorage(key: string, val: any) {
  checkStorage()
  if (useStorage) {
    const operation = new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [key]: val }, () => {
        const error = getStorageApiError('write', key)
        if (error) {
          reject(error)
          return
        }
        storageData[key] = val
        resolve()
      })
    })
    return reportRejectedStorageOperation(operation, 'write', key)
  } else {
    try {
      localStorage.setItem(key, JSON.stringify(val))
      return Promise.resolve()
    } catch (error) {
      return reportRejectedStorageOperation(Promise.reject(error), 'write', key)
    }
  }
}

export function removeStorage(keys: string | string[]) {
  checkStorage()
  if (useStorage) {
    const operation = new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const error = getStorageApiError('remove', Array.isArray(keys) ? keys.join(',') : keys)
        if (error) {
          reject(error)
          return
        }
        if (Array.isArray(keys)) keys.forEach((target) => delete storageData[target])
        else delete storageData[keys]
        resolve()
      })
    })
    return reportRejectedStorageOperation(
      operation,
      'remove',
      Array.isArray(keys) ? keys.join(',') : keys
    )
  } else {
    try {
      if (Array.isArray(keys)) keys.forEach((target) => localStorage.removeItem(target))
      else localStorage.removeItem(keys)
      return Promise.resolve()
    } catch (error) {
      return reportRejectedStorageOperation(
        Promise.reject(error),
        'remove',
        Array.isArray(keys) ? keys.join(',') : keys
      )
    }
  }
}

export function clearStorage() {
  checkStorage()
  if (useStorage) {
    const operation = new Promise<void>((resolve, reject) => {
      chrome.storage.local.clear(() => {
        const error = getStorageApiError('clear')
        if (error) {
          reject(error)
          return
        }
        storageData = {}
        resolve()
      })
    })
    return reportRejectedStorageOperation(operation, 'clear')
  } else {
    try {
      localStorage.clear()
      return Promise.resolve()
    } catch (error) {
      return reportRejectedStorageOperation(Promise.reject(error), 'clear')
    }
  }
}

function checkStorage() {
  if (!storageData) {
    throw new Error("Storage wasn't initialized with 'init()'")
  }
}

function getDefaultValue(value, defaultValue) {
  if (value == null) {
    return defaultValue
  }
  return value
}

/**获取全部数据 */
export function getStorageAll(): Promise<{ [key: string]: any }> {
  if (useStorage) {
    const operation = new Promise<{ [key: string]: any }>((resolve, reject) => {
      chrome.storage.local.get(null, (result) => {
        const error = getStorageApiError('read')
        if (error) {
          reject(error)
          return
        }
        storageData = result || {}
        resolve(result)
      })
    })
    return reportRejectedStorageOperation(operation, 'read')
  } else {
    if (JSON.stringify(localStorage) === '{}') return Promise.resolve({})
    const data = Object.keys(localStorage).reduce(function (obj, str) {
      try {
        obj[str] = JSON.parse(localStorage.getItem(str) as any)
      } catch (e) {
        obj[str] = localStorage.getItem(str)
      }
      return obj
    }, {})
    return Promise.resolve(data)
  }
}
