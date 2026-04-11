interface LanguageMap {
  [key: string]: string
}

interface PromptConfig {
  SYSTEM: string
  USER: (text: string, sourceLanguage: string, targetLanguage: string) => string
}

interface CaptionSelectors {
  CONTAINER: string
  BLOCK: string
  SPEAKER: string
  TEXT: string
}

interface StorageKeys {
  SOURCE_LANGUAGE: string
  TARGET_LANGUAGE: string
  IS_ACTIVE: string
  EXTENSION_LANGUAGE: string
  API_KEY: string
}

interface DefaultStorageValues {
  [key: string]: string | boolean
}

export const LANGUAGES: LanguageMap = {
  vi: 'Vietnamese',
  en: 'English',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  th: 'Thai',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
  it: 'Italian',
  pt: 'Portuguese',
  ms: 'Malay',
  id: 'Indonesian',
  ar: 'Arabic',
  hi: 'Hindi',
}

export const EXTENSION_LANGUAGES: LanguageMap = {
  vi: 'Tiếng Việt',
  en: 'English',
  zh: '中文',
}

export const DEFAULT_LANGUAGE = 'vi'

export const DEFAULT_SOURCE_LANGUAGE = 'en'

export const GEMINI_API_PLACEHOLDER_KEY = '[ENCRYPTION_KEY]'

export const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview'

export const TEMPERATURE = 0.1

export const DEBOUNCE_MS = 500

export const ARIA_LABELS: LanguageMap = {
  vi: 'Phụ đề',
  en: 'Captions',
  zh: '字幕',
  ja: '字幕',
}

export const CAPTION_SELECTORS: CaptionSelectors = {
  CONTAINER: '[role="region"]',
  BLOCK: '.nMcdL.bj4p3b',
  SPEAKER: '.NWpY1d',
  TEXT: '.ygicle.VbkSUe',
}

export const STORAGE_KEYS: StorageKeys = {
  SOURCE_LANGUAGE: 'meet_translate_source_language',
  TARGET_LANGUAGE: 'meet_translate_target_language',
  IS_ACTIVE: 'meet_translate_is_active',
  EXTENSION_LANGUAGE: 'meet_translate_extension_language',
  API_KEY: 'meet_translate_api_key',
}

export const DEFAULT_STORAGE_VALUES: DefaultStorageValues = {
  [STORAGE_KEYS.SOURCE_LANGUAGE]: DEFAULT_SOURCE_LANGUAGE,
  [STORAGE_KEYS.TARGET_LANGUAGE]: DEFAULT_LANGUAGE,
  [STORAGE_KEYS.IS_ACTIVE]: true,
  [STORAGE_KEYS.EXTENSION_LANGUAGE]: DEFAULT_LANGUAGE,
  [STORAGE_KEYS.API_KEY]: '',
}

export const PROMPT: PromptConfig = {
  SYSTEM: "You are a professional translator. Your task is to translate the text provided by the user from the source language to the target language.\n\nRules:\n1. Translate the text accurately and naturally.\n2. Keep the tone and style of the original text.\n3. If the text contains technical terms, translate them appropriately based on the context.\n4. Keep proper nouns (names of people, places, organizations) unchanged.\n5. Keep numbers, dates, times, and monetary values unchanged.\n6. Keep technical terms and jargon unchanged if they are commonly used in their original form.",
  USER: (text: string, sourceLanguage: string, targetLanguage: string): string =>
    `Translate the following text from ${sourceLanguage} to ${targetLanguage}:\n\n${text}\n\nReturn only the translated text, without any additional formatting or explanation.`,
}
