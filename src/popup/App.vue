<template>
  <div class="w-[340px] bg-white text-neutral-900 font-[Inter] text-sm antialiased">
    <header class="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-neutral-200">
      <div class="w-10 h-10 rounded-[10px] bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
        <Globe :size="20" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-[15px] font-bold leading-tight text-neutral-900">Meet AI Translator</h1>
        <p class="text-xs text-neutral-500 leading-tight mt-[1px]">{{ t('ui.subtitle') }}</p>
      </div>
    </header>

    <div class="px-4 py-3 flex flex-col gap-3">
      <section class="bg-neutral-100 rounded-[10px] p-3 flex flex-col gap-2.5">
        <div class="flex items-center gap-1.5">
          <Lock class="text-neutral-500 flex-shrink-0" :size="16" />
          <span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{{ t('ui.section_auth') }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <label for="apiKey" class="text-xs font-medium text-neutral-700">{{ t('ui.gemini_api_key') }}</label>
          <div class="relative flex items-center">
            <input
              id="apiKey"
              :type="isKeyVisible ? 'text' : 'password'"
              v-model="apiKey"
              class="w-full px-2.5 py-2 pr-9 border border-neutral-200 rounded-md text-sm bg-white text-neutral-900 transition-all duration-150 focus:outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 placeholder:text-neutral-500"
              :placeholder="t('ui.placeholder_api_key')"
            />
            <button
              type="button"
              @click="toggleKeyVisibility"
              class="absolute right-1.5 w-7 h-7 border-none bg-transparent rounded-md flex items-center justify-center cursor-pointer text-neutral-500 transition-all duration-150 hover:bg-neutral-200 hover:text-neutral-900"
              aria-label="Toggle API key visibility"
            >
              <Eye v-show="!isKeyVisible" :size="16" />
              <EyeOff v-show="isKeyVisible" :size="16" />
            </button>
          </div>
        </div>
      </section>

      <section class="bg-neutral-100 rounded-[10px] p-3 flex flex-col gap-2.5">
        <div class="flex items-center gap-1.5">
          <Languages class="text-neutral-500 flex-shrink-0" :size="16" />
          <span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{{ t('ui.section_lang') }}</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label for="sourceLang" class="text-xs font-medium text-neutral-700">{{ t('ui.source_language') }}</label>
            <select
              id="sourceLang"
              v-model="sourceLanguage"
              class="w-full px-2.5 py-2 border border-neutral-200 rounded-md text-sm bg-white text-neutral-900 cursor-pointer appearance-none pr-7 transition-all duration-150 focus:outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
              style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E&quot;); background-repeat: no-repeat; background-position: right 8px center;"
            >
              <option v-for="(name, code) in languages" :key="code" :value="code">{{ langLabel(code) }}</option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="targetLang" class="text-xs font-medium text-neutral-700">{{ t('ui.target_language') }}</label>
            <select
              id="targetLang"
              v-model="targetLanguage"
              class="w-full px-2.5 py-2 border border-neutral-200 rounded-md text-sm bg-white text-neutral-900 cursor-pointer appearance-none pr-7 transition-all duration-150 focus:outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
              style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E&quot;); background-repeat: no-repeat; background-position: right 8px center;"
            >
              <option v-for="(name, code) in languages" :key="code" :value="code">{{ langLabel(code) }}</option>
            </select>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label for="extLang" class="text-xs font-medium text-neutral-700">{{ t('ui.extension_language') }}</label>
          <select
            id="extLang"
            v-model="extLanguage"
            @change="onExtLangChange"
            class="w-full px-2.5 py-2 border border-neutral-200 rounded-md text-sm bg-white text-neutral-900 cursor-pointer appearance-none pr-7 transition-all duration-150 focus:outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
            style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E&quot;); background-repeat: no-repeat; background-position: right 8px center;"
          >
            <option v-for="(name, code) in extLanguages" :key="code" :value="code">{{ name }}</option>
          </select>
        </div>
      </section>

      <section class="bg-neutral-100 rounded-[10px] p-3 flex flex-col gap-2.5">
        <div class="flex items-center gap-1.5">
          <Bell class="text-neutral-500 flex-shrink-0" :size="16" />
          <span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{{ t('ui.section_status') }}</span>
        </div>
        <div class="flex items-center gap-2.5">
          <span class="flex-1 text-sm font-medium text-neutral-900">{{ t('ui.translation_active') }}</span>
          <label class="relative inline-block w-10 h-[22px] flex-shrink-0">
            <input
              type="checkbox"
              v-model="isActive"
              @change="updateStatusText"
              class="opacity-0 w-0 h-0"
            />
            <span
              class="absolute cursor-pointer top-0 left-0 right-0 bottom-0 rounded-[22px] transition-all duration-200"
              :class="isActive ? 'bg-green-100' : 'bg-neutral-200'"
            >
              <span
                class="absolute h-4 w-4 bottom-[3px] left-[3px] bg-white rounded-full shadow-sm transition-all duration-200"
                :class="isActive ? 'translate-x-[18px] !bg-green-800' : ''"
              ></span>
            </span>
          </label>
          <span
            class="text-[11px] font-semibold px-2 py-0.5 rounded-full min-w-[40px] text-center"
            :class="isActive ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'"
          >{{ statusText }}</span>
        </div>
      </section>
    </div>

    <footer class="flex gap-2 px-4 pb-4 pt-3 border-t border-neutral-200">
      <button
        @click="saveSettings"
        class="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-[9px] border-none rounded-md text-sm font-semibold cursor-pointer bg-neutral-900 text-white transition-all duration-150 hover:bg-neutral-700 active:scale-[0.98]"
      >
        <Save :size="15" />
        <span>{{ t('ui.save') }}</span>
      </button>
      <button
        @click="() => window.close()"
        class="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] border-none rounded-md text-sm font-semibold cursor-pointer bg-transparent text-neutral-500 transition-all duration-150 hover:bg-neutral-100 hover:text-neutral-900 active:scale-[0.98]"
      >
        {{ t('ui.cancel') }}
      </button>
    </footer>

    <div
      v-if="message"
      class="mx-4 mb-3 px-3 py-2 rounded-md text-xs font-medium text-center animate-[slideIn_200ms_ease]"
      :class="messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
    >{{ message }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { LANGUAGES, EXTENSION_LANGUAGES, DEFAULT_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, STORAGE_KEYS } from '../constants'
import { Globe, Lock, Eye, EyeOff, Languages, Bell, Save } from '@lucide/vue'

interface Translations {
  language?: Record<string, string>
  ui?: Record<string, string>
  panel?: Record<string, string>
  [key: string]: unknown
}

const languages = LANGUAGES
const extLanguages = EXTENSION_LANGUAGES

const apiKey = ref('')
const sourceLanguage = ref(DEFAULT_SOURCE_LANGUAGE)
const targetLanguage = ref(DEFAULT_LANGUAGE)
const extLanguage = ref(DEFAULT_LANGUAGE)
const isActive = ref(true)
const isKeyVisible = ref(false)
const translations = ref<Translations>({})
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

function t(key: string): string {
  const keys = key.split('.')
  let value: unknown = translations.value
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k]
  }
  return (value as string) || key
}

function langLabel(code: string): string {
  return translations.value.language?.[code] || LANGUAGES[code] || code
}

function updateStatusText(): void {
  // statusText is computed in template via isActive
}

function toggleKeyVisibility(): void {
  isKeyVisible.value = !isKeyVisible.value
}

function onExtLangChange(): void {
  loadTranslations(extLanguage.value)
}

function loadTranslations(lang: string): void {
  fetch(chrome.runtime.getURL(`lang/${lang}.json`))
    .then((res) => res.json())
    .then((data: Translations) => {
      translations.value = data
    })
    .catch((err: Error) => {
      console.error('[Meet Translate] Failed to load translations:', err)
    })
}

function showMessage(type: 'success' | 'error', text: string): void {
  message.value = text
  messageType.value = type
  if (type === 'success') {
    setTimeout(() => {
      message.value = ''
    }, 3000)
  }
}

function loadSettings(): void {
  chrome.storage.local.get([STORAGE_KEYS.API_KEY], (localItems: Record<string, unknown>) => {
    chrome.storage.sync.get(
      [
        STORAGE_KEYS.SOURCE_LANGUAGE,
        STORAGE_KEYS.TARGET_LANGUAGE,
        STORAGE_KEYS.EXTENSION_LANGUAGE,
        STORAGE_KEYS.IS_ACTIVE,
      ],
      (syncItems: Record<string, unknown>) => {
        const items = { ...localItems, ...syncItems }
        apiKey.value = (items[STORAGE_KEYS.API_KEY] as string) || ''
        sourceLanguage.value = (items[STORAGE_KEYS.SOURCE_LANGUAGE] as string) || DEFAULT_SOURCE_LANGUAGE
        targetLanguage.value = (items[STORAGE_KEYS.TARGET_LANGUAGE] as string) || DEFAULT_LANGUAGE
        extLanguage.value = (items[STORAGE_KEYS.EXTENSION_LANGUAGE] as string) || DEFAULT_LANGUAGE
        isActive.value = items[STORAGE_KEYS.IS_ACTIVE] !== false
        loadTranslations(extLanguage.value)
      }
    )
  })
}

function saveSettings(): void {
  const trimmedApiKey = apiKey.value.trim()

  if (!trimmedApiKey) {
    showMessage('error', t('ui.error_api_key') || 'API Key is required')
    return
  }

  const localSettings: Record<string, unknown> = {
    [STORAGE_KEYS.API_KEY]: trimmedApiKey,
  }

  const syncSettings: Record<string, unknown> = {
    [STORAGE_KEYS.SOURCE_LANGUAGE]: sourceLanguage.value,
    [STORAGE_KEYS.TARGET_LANGUAGE]: targetLanguage.value,
    [STORAGE_KEYS.EXTENSION_LANGUAGE]: extLanguage.value,
    [STORAGE_KEYS.IS_ACTIVE]: isActive.value,
  }

  chrome.storage.local.set(localSettings, () => {
    if (chrome.runtime.lastError) {
      showMessage('error', t('ui.error_save') || 'Failed to save API Key')
      return
    }

    chrome.storage.sync.set(syncSettings, () => {
      if (chrome.runtime.lastError) {
        showMessage('error', t('ui.error_save') || 'Failed to save settings')
        return
      }

      showMessage('success', t('ui.save_success') || 'Settings saved successfully')
      setTimeout(() => {
        window.close()
      }, 1000)
    })
  })
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
