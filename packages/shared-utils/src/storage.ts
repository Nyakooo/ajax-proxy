import { StorageKey } from './consts'
import { useStorage } from './env'

// chrome.storage.sync.set 大于8,192字节的数据时，会报错 -> QUOTA_BYTES_PER_ITEM quota exceeded
// chrome.storage.local.set可以包含5242880

let storageData
let storageChangeListenerRegistered = false
let localStorageChangeListenerRegistered = false
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

function parseLocalStorageValue(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function loadLocalStorage() {
  return Object.keys(localStorage).reduce<Record<string, any>>((data, key) => {
    const value = localStorage.getItem(key)
    if (value !== null) data[key] = parseLocalStorageValue(value)
    return data
  }, {})
}

function handleLocalStorageChanged(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== localStorage) return
  if (event.key === null) {
    storageData = {}
  } else if (event.newValue === null) {
    delete storageData[event.key]
  } else if (event.key) {
    storageData[event.key] = parseLocalStorageValue(event.newValue)
  }
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
      storageData = loadLocalStorage()
      if (!localStorageChangeListenerRegistered) {
        globalThis.addEventListener?.('storage', handleLocalStorageChanged as EventListener)
        localStorageChangeListenerRegistered = true
      }
      resolve()
    }
  })
  return reportRejectedStorageOperation(operation, 'initialize')
}

export function getStorage(key: string, defaultValue: any = null) {
  checkStorage()
  return getDefaultValue(storageData[key], defaultValue)
}

/**读取初始化后本地缓存的完整快照，不再访问 Chrome storage。*/
export function getStorageSnapshot(): Record<string, unknown> {
  checkStorage()
  return structuredClone(storageData)
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
      const storedValue = localStorage.getItem(key)
      if (storedValue === null) {
        delete storageData[key]
        return Promise.resolve(defaultValue)
      }
      const value = parseLocalStorageValue(storedValue)
      storageData[key] = value
      return Promise.resolve(getDefaultValue(value, defaultValue))
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
      storageData[key] = val
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
      if (Array.isArray(keys)) keys.forEach((target) => delete storageData[target])
      else delete storageData[keys]
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
      storageData = {}
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
    return Promise.resolve({ ...storageData })
  }
}
