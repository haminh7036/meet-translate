import { DEFAULT_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, CAPTION_SELECTORS } from '../constants'
import { logger } from './logger'
import {
  getCaptionContainer,
  setCaptionContainer,
  getAriaLabel,
  isValidCaptionContainer,
  findCaptionContainerByAriaLabel,
  getBlockKey,
  getSpeakerName,
} from './captions'
import { t, loadPanelTranslations } from './i18n'
import {
  initSentenceHistory,
  clearSentenceHistory,
  deduplicateBeforeSend,
  markSentenceProcessed,
  splitIntoSentences,
} from './sentences'
import {
  createPanel,
  createPanelState,
  toggleMinimize,
  updateStatus,
  updatePanelTexts,
  addPendingItemToPanel,
  updatePendingItemStatus,
  finalizePendingItem,
  copyAllTranslations,
} from './panel'
import { loadSettings, onSettingsChange, Settings } from './settings'

const RETRY_INTERVAL_MS = 3000
const POLL_INTERVAL_MS = 500
const STABLE_DEBOUNCE_MS = 1500
const POST_EXTRACT_COOLDOWN_MS = 500
const SILENCE_TIMEOUT_MS = 12000
const DOM_READY_TIMEOUT_MS = 15000

interface BlockState {
  stableText: string
  pendingText: string
  lastChangeTime: number
  cooldownUntil?: number
}

let settings: Settings = getDefaultSettings()
const panelState = createPanelState()
const blockState = new Map<string, BlockState>()
const sentenceBuffer: string[] = []

let retryTimer: ReturnType<typeof setTimeout> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
let silenceTimer: ReturnType<typeof setTimeout> | null = null
let activeSpeaker: string | null = null
let isTranslating = false

function getDefaultSettings(): Settings {
  return {
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    targetLanguage: DEFAULT_LANGUAGE,
    isActive: true,
    apiKey: '',
    extLanguage: DEFAULT_LANGUAGE,
  }
}

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function clearSilenceTimer(): void {
  if (silenceTimer) {
    clearTimeout(silenceTimer)
    silenceTimer = null
  }
}

function detectCaptionContainer(): boolean {
  const container = getCaptionContainer()
  if (container && document.body.contains(container) && isValidCaptionContainer(container)) {
    return true
  }

  const ariaLabel = getAriaLabel()
  const found = findCaptionContainerByAriaLabel(ariaLabel)
  if (found) {
    setCaptionContainer(found)
  } else {
    const regions = document.querySelectorAll('[role="region"]')
    for (const region of regions) {
      if (isValidCaptionContainer(region)) {
        setCaptionContainer(region)
        break
      }
    }
  }

  if (!getCaptionContainer()) {
    logger.warn('No valid caption container found. Will retry in', RETRY_INTERVAL_MS / 1000, 's...')
    clearRetryTimer()
    retryTimer = setTimeout(() => {
      const found = detectCaptionContainer()
      if (found) startPolling()
    }, RETRY_INTERVAL_MS)
    return false
  }

  logger.log('Found caption container')
  clearRetryTimer()
  return true
}

function extractNewSentences(stableText: string, previousStableText: string): string[] {
  if (!stableText) return []
  if (stableText === previousStableText) return []

  const allSentences = splitIntoSentences(stableText)
  const prevSentences = splitIntoSentences(previousStableText)

  const newSentences: string[] = []
  let prevIndex = 0

  for (const sentence of allSentences) {
    let found = false
    for (let j = prevIndex; j < prevSentences.length; j++) {
      if (sentence === prevSentences[j]) {
        prevIndex = j + 1
        found = true
        break
      }
    }
    if (!found) newSentences.push(sentence)
  }

  return newSentences
}

function getOrCreateBlockState(blockKey: string): BlockState {
  if (!blockState.has(blockKey)) {
    blockState.set(blockKey, { stableText: '', pendingText: '', lastChangeTime: 0 })
  }
  return blockState.get(blockKey)!
}

async function checkBlockStability(
  textEl: Element,
  blockKey: string,
  state: BlockState
): Promise<string[]> {
  const currentText = textEl.textContent?.trim() || ''
  if (!currentText) return []

  if (state.cooldownUntil && Date.now() < state.cooldownUntil) return []

  if (currentText === state.pendingText) {
    const timeSinceChange = Date.now() - state.lastChangeTime
    if (timeSinceChange >= STABLE_DEBOUNCE_MS && currentText !== state.stableText) {
      const cooldownEnd = Date.now() + POST_EXTRACT_COOLDOWN_MS
      logger.log(`Block ${blockKey} STABLE: "${currentText.substring(0, 80)}"`)
      const newSentences = extractNewSentences(currentText, state.stableText)
      state.stableText = currentText
      state.pendingText = ''
      state.cooldownUntil = cooldownEnd
      logger.log('New sentences:', newSentences)
      return newSentences
    }
    return []
  }

  // Text changed — extract diff immediately instead of waiting for stability
  const newSentences: string[] = []
  if (state.stableText && currentText.length > state.stableText.length) {
    const appended = currentText.slice(state.stableText.length).trim()
    if (appended && appended.length > 2) {
      newSentences.push(...splitIntoSentences(appended))
    }
  }

  state.pendingText = currentText
  state.lastChangeTime = Date.now()

  if (newSentences.length > 0) {
    state.stableText = currentText
    state.cooldownUntil = Date.now() + POST_EXTRACT_COOLDOWN_MS
    logger.log(`Block ${blockKey} INCREMENTAL:`, newSentences)
    return newSentences
  }

  return []
}

function resetSilenceTimer(): void {
  clearSilenceTimer()
  silenceTimer = setTimeout(() => {
    logger.log('Silence timeout, flushing buffer')
    flushBuffer()
  }, SILENCE_TIMEOUT_MS)
}

async function flushBuffer(): Promise<void> {
  if (sentenceBuffer.length === 0 || isTranslating) return

  isTranslating = true
  panelState.pendingItemIndex = 'flushing'

  const deduplicated = await deduplicateBeforeSend(sentenceBuffer)
  sentenceBuffer.length = 0
  clearSilenceTimer()

  if (deduplicated.length === 0) {
    isTranslating = false
    panelState.pendingItemIndex = null
    updateStatus(t('panel.status_deduped'))
    return
  }

  const textToTranslate = deduplicated.map((s) => s.original).join(' ')
  const sentenceCount = deduplicated.length

  addPendingItemToPanel(textToTranslate, panelState)

  updateStatus(t('panel.status_translating'))
  updatePendingItemStatus(t('panel.status_translating'), panelState)

  logger.log(`Sending batch (${sentenceCount} sentences):`, textToTranslate.substring(0, 150))

  chrome.runtime.sendMessage(
    {
      type: 'TRANSLATE',
      text: textToTranslate,
      sourceLang: settings.sourceLanguage,
      targetLang: settings.targetLanguage,
      apiKey: settings.apiKey,
    },
    (response: unknown) => {
      isTranslating = false

      if (chrome.runtime.lastError) {
        logger.error('Message error:', chrome.runtime.lastError.message)
        updateStatus(t('panel.status_error_connection'))
        updatePendingItemStatus(t('panel.status_error_connection'), panelState)
        return
      }

      const resp = response as Record<string, unknown> | undefined
      if (resp && resp.success && resp.translatedText) {
        finalizePendingItem(resp.translatedText as string, panelState)
        updateStatus(t('panel.status_translated'))
        deduplicated.forEach((s) => markSentenceProcessed(s.normalized))
      } else {
        logger.warn('Translation failed:', resp?.error)
        updateStatus(t('panel.status_error_translation'))
        updatePendingItemStatus(t('panel.status_error_translation'), panelState)
      }
    }
  )
}

async function pollCaptions(): Promise<void> {
  if (!settings.isActive || !getCaptionContainer()) return

  const textEls = getCaptionContainer()!.querySelectorAll(CAPTION_SELECTORS.TEXT)
  logger.log('Poll captions: found', textEls.length, 'text elements')
  if (textEls.length === 0) return

  for (const textEl of textEls) {
    const blockKey = getBlockKey(textEl)
    const state = getOrCreateBlockState(blockKey)
    const newSentences = await checkBlockStability(textEl, blockKey, state)

    if (newSentences.length > 0) {
      const currentSpeaker = getSpeakerName(textEl)

      if (activeSpeaker && currentSpeaker !== activeSpeaker) {
        logger.log(`Speaker changed: "${activeSpeaker}" -> "${currentSpeaker}", flushing buffer`)
        flushBuffer()
      }

      activeSpeaker = currentSpeaker
      sentenceBuffer.push(...newSentences)
      logger.log(`Buffer (${currentSpeaker}): ${sentenceBuffer.length} sentences`)
      resetSilenceTimer()

      if (panelState.pendingItemIndex !== null && panelState.pendingItemIndex !== 'flushing') {
        const item = document.querySelector(`.translation-item[data-index="${panelState.pendingItemIndex}"]`)
        if (item) {
          const originalEl = item.querySelector('.pending-original')
          if (originalEl) originalEl.textContent = sentenceBuffer.join(' ')
        }
      }
    }
  }

  if (sentenceBuffer.length > 0 && !silenceTimer) resetSilenceTimer()
}

function startPolling(): void {
  stopPolling()
  createPanel(panelState, () => copyAllTranslations(panelState), () => {
    toggleMinimize(panelState)
    updateStatus(panelState.isMinimized ? t('panel.status_minimized') : t('panel.status_waiting'))
  })
  pollingTimer = setInterval(pollCaptions, POLL_INTERVAL_MS)
  logger.log('Polling started, interval:', POLL_INTERVAL_MS, 'ms')
  logger.log('Stable debounce:', STABLE_DEBOUNCE_MS, 'ms')
}

function stopPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
  clearSilenceTimer()
}

function waitForDOMReady(): void {
  const startPollingIfReady = () => {
    logger.log('initCaptionDetection called')
    const found = detectCaptionContainer()
    logger.log('detectCaptionContainer returned:', found)
    if (found) {
      logger.log('Container found, starting polling')
      startPolling()
    } else {
      logger.log('Container not found, will retry')
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(startPollingIfReady, 2000)
    })
  } else {
    setTimeout(startPollingIfReady, 2000)
  }

  // Fallback: retry detecting caption containers if they appear later
  const maxRetries = Math.floor(DOM_READY_TIMEOUT_MS / RETRY_INTERVAL_MS)
  let retryCount = 0
  const retryDetection = setInterval(() => {
    retryCount++
    if (getCaptionContainer()) {
      clearInterval(retryDetection)
      return
    }
    logger.log('Retrying caption detection...', retryCount, '/', maxRetries)
    const found = detectCaptionContainer()
    if (found && !pollingTimer) {
      clearInterval(retryDetection)
      startPolling()
    }
    if (retryCount >= maxRetries) {
      clearInterval(retryDetection)
      logger.warn('Timed out waiting for caption container after', DOM_READY_TIMEOUT_MS / 1000, 's')
    }
  }, RETRY_INTERVAL_MS)
}

function applySettings(s: Settings): void {
  settings = s
  loadPanelTranslations(s.extLanguage)
  updatePanelTexts()
  if (!s.isActive) updateStatus(t('panel.status_off'))
}

logger.log('Content script loaded!')

initSentenceHistory().then(async () => {
  await clearSentenceHistory()
  loadSettings((s) => {
    applySettings(s)
    waitForDOMReady()
  })
})

onSettingsChange((updates) => {
  if (updates.sourceLanguage !== undefined) settings.sourceLanguage = updates.sourceLanguage
  if (updates.targetLanguage !== undefined) settings.targetLanguage = updates.targetLanguage
  if (updates.isActive !== undefined) {
    settings.isActive = updates.isActive
    if (!updates.isActive) updateStatus(t('panel.status_off'))
  }
  if (updates.apiKey !== undefined) settings.apiKey = updates.apiKey
  if (updates.extLanguage !== undefined) loadPanelTranslations(updates.extLanguage)
})
