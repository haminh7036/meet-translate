import { LANGUAGES, PROMPT, TEMPERATURE, GEMINI_MODEL } from './constants'

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface TranslationResponse {
  success: boolean
  translatedText?: string
  error?: string
}

function buildApiUrl(model: string, apiKey: string): string {
  return `${GEMINI_API_BASE_URL}/${model}:generateContent?key=${apiKey}`
}

function buildRequestBody(
  text: string,
  sourceLang: string,
  targetLang: string
): Record<string, unknown> {
  const sourceLangName = LANGUAGES[sourceLang] || sourceLang
  const targetLangName = LANGUAGES[targetLang] || targetLang

  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: PROMPT.USER(text, sourceLangName, targetLangName) }],
      },
    ],
    systemInstruction: {
      parts: [{ text: PROMPT.SYSTEM }],
    },
    generationConfig: {
      temperature: TEMPERATURE,
    },
  }
}

async function callGeminiAPI(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string
): Promise<string> {
  const url = buildApiUrl(GEMINI_MODEL, apiKey)
  const body = buildRequestBody(text, sourceLang, targetLang)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as Record<string, unknown>
    const errorMessage = (errorData.error as Record<string, string>)?.message || `API error: ${response.status}`
    throw new Error(errorMessage)
  }

  const data = await response.json() as Record<string, unknown>
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined

  if (
    candidates &&
    candidates[0] &&
    (candidates[0] as Record<string, unknown>).content &&
    ((candidates[0] as Record<string, unknown>).content as Record<string, unknown>).parts &&
    (((candidates[0] as Record<string, unknown>).content as Record<string, unknown>).parts as Array<Record<string, unknown>>)[0]?.text
  ) {
    const parts = ((candidates[0] as Record<string, unknown>).content as Record<string, unknown>).parts as Array<Record<string, unknown>>
    return (parts[0].text as string).trim()
  }

  throw new Error('Invalid response from Gemini API')
}

async function translateWithRetry(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  maxRetries = 1
): Promise<string | null> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGeminiAPI(text, sourceLang, targetLang, apiKey)
      return result
    } catch (error) {
      lastError = error as Error
      console.error(`[Meet Translate] Translation attempt ${attempt + 1} failed:`, (error as Error).message)

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  console.error('[Meet Translate] Translation failed after retries:', lastError?.message)
  return null
}

chrome.runtime.onMessage.addListener(
  (
    message: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: TranslationResponse) => void
  ): boolean => {
    console.log('[Meet Translate] Background received message:', message.type)

    if (message.type !== 'TRANSLATE') return false

    console.log('[Meet Translate] Starting translation for', message.sourceLang, '->', message.targetLang)

    translateWithRetry(
      message.text as string,
      message.sourceLang as string,
      message.targetLang as string,
      message.apiKey as string
    )
      .then((translatedText) => {
        console.log('[Meet Translate] Translation result:', translatedText ? 'success' : 'failed')
        if (translatedText) {
          sendResponse({ success: true, translatedText })
        } else {
          sendResponse({ success: false, error: 'Translation failed after retries' })
        }
      })
      .catch((error: Error) => {
        console.error('[Meet Translate] Translation error:', error)
        sendResponse({ success: false, error: error.message })
      })

    return true
  }
)
