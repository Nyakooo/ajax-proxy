import { StorageKey } from './consts'
import { useStorage } from './env'

// chrome.storage.sync.set 大于8,192字节的数据时，会报错 -> QUOTA_BYTES_PER_ITEM quota exceeded
// chrome.storage.local.set可以包含5242880

let storageData
let storageChangeListenerRegistered = false
type StorageChanges = Record<string, chrome.storage.StorageChange>
let pendingStorageChanges: StorageChanges[] = []

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
  return new Promise((resolve) => {
    if (useStorage) {
      if (!storageChangeListenerRegistered) {
        chrome.storage.onChanged.addListener(handleStorageChanged)
        storageChangeListenerRegistered = true
      }
      chrome.storage.local.get(null, result => {
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
}

export function getStorage(key: string, defaultValue: any = null) {
  checkStorage()
  if (useStorage) {
    return getDefaultValue(storageData[key], defaultValue)
  } else {
    try {
      return getDefaultValue(JSON.parse(localStorage.getItem(key) as any), defaultValue)
    } catch (e) { }
  }
}

/**不走缓存获取数据 */
export function getRealStorage(key: StorageKey, defaultValue: any = null) {
  if (useStorage) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => {
        if (result.hasOwnProperty(key)) {
          storageData[key] = result[key]
          resolve(getDefaultValue(result[key], defaultValue))
        }
        else {
          delete storageData[key]
          resolve(defaultValue)
        }
      })
    })
  } else {
    try {
      const result = getDefaultValue(JSON.parse(localStorage.getItem(key) as any), defaultValue)
      return Promise.resolve(result)
    } catch (e) {
      return Promise.resolve(null)
    }
  }
}

export function setStorage(key: string, val: any) {
  checkStorage()
  if (useStorage) {
    storageData[key] = val
    chrome.storage.local.set({ [key]: val })
  } else {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch (e) { }
  }
}

export function removeStorage(keys: string | string[]) {
  checkStorage()
  if (useStorage) {
    if (Array.isArray(keys)) keys.forEach(target => delete storageData[target])
    else delete storageData[keys]
    chrome.storage.local.remove(keys)
  } else {
    try {
      if (Array.isArray(keys)) keys.forEach(target => localStorage.removeItem(target))
      else localStorage.removeItem(keys)
    } catch (e) { }
  }
}

export function clearStorage() {
  checkStorage()
  if (useStorage) {
    storageData = {}
    chrome.storage.local.clear()
  } else {
    try {
      localStorage.clear()
    } catch (e) { }
  }
}

function checkStorage() {
  if (!storageData) {
    throw new Error('Storage wasn\'t initialized with \'init()\'')
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
    return new Promise(resolve => {
      chrome.storage.local.get(null, result => {
        storageData = result || {}
        resolve(result)
      })
    })
  } else {
    if (JSON.stringify(localStorage) === '{}') return Promise.resolve({})
    const data = Object.keys(localStorage).reduce(function (obj, str) {
      try {
        obj[str] = JSON.parse(localStorage.getItem(str) as any)
      } catch (e) {
        obj[str] = localStorage.getItem(str)
      }
      return obj
    }, {});
    return Promise.resolve(data)
  }
}
