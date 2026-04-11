import { DEFAULT_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, STORAGE_KEYS } from '../constants'

export interface Settings {
  sourceLanguage: string
  targetLanguage: string
  isActive: boolean
  apiKey: string
  extLanguage: string
}

export function getDefaultSettings(): Settings {
  return {
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    targetLanguage: DEFAULT_LANGUAGE,
    isActive: true,
    apiKey: '',
    extLanguage: DEFAULT_LANGUAGE,
  }
}

export function loadSettings(callback: (settings: Settings) => void): void {
  chrome.storage.local.get([STORAGE_KEYS.API_KEY], (localItems: Record<string, unknown>) => {
    chrome.storage.sync.get(
      [
        STORAGE_KEYS.SOURCE_LANGUAGE,
        STORAGE_KEYS.TARGET_LANGUAGE,
        STORAGE_KEYS.IS_ACTIVE,
        STORAGE_KEYS.EXTENSION_LANGUAGE,
      ],
      (syncItems: Record<string, unknown>) => {
        const items = { ...localItems, ...syncItems }
        callback({
          sourceLanguage: (items[STORAGE_KEYS.SOURCE_LANGUAGE] as string) || DEFAULT_SOURCE_LANGUAGE,
          targetLanguage: (items[STORAGE_KEYS.TARGET_LANGUAGE] as string) || DEFAULT_LANGUAGE,
          isActive: (items[STORAGE_KEYS.IS_ACTIVE] as boolean) !== false && !!items[STORAGE_KEYS.API_KEY],
          apiKey: (items[STORAGE_KEYS.API_KEY] as string) || '',
          extLanguage: (items[STORAGE_KEYS.EXTENSION_LANGUAGE] as string) || DEFAULT_LANGUAGE,
        })
      }
    )
  })
}

export function onSettingsChange(
  onChange: (settings: Partial<Settings>) => void
): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    const updates: Partial<Settings> = {}
    if (areaName === 'sync') {
      if (changes[STORAGE_KEYS.SOURCE_LANGUAGE]) {
        updates.sourceLanguage = changes[STORAGE_KEYS.SOURCE_LANGUAGE].newValue as string
      }
      if (changes[STORAGE_KEYS.TARGET_LANGUAGE]) {
        updates.targetLanguage = changes[STORAGE_KEYS.TARGET_LANGUAGE].newValue as string
      }
      if (changes[STORAGE_KEYS.IS_ACTIVE]) {
        updates.isActive = changes[STORAGE_KEYS.IS_ACTIVE].newValue as boolean
      }
      if (changes[STORAGE_KEYS.EXTENSION_LANGUAGE]) {
        updates.extLanguage = changes[STORAGE_KEYS.EXTENSION_LANGUAGE].newValue as string
      }
    }
    if (areaName === 'local' && changes[STORAGE_KEYS.API_KEY]) {
      updates.apiKey = changes[STORAGE_KEYS.API_KEY].newValue as string
    }
    if (Object.keys(updates).length > 0) {
      onChange(updates)
    }
  })
}
