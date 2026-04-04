// background.js — Service Worker for Meet AI Translator
// Handles Gemini API calls and caches translations

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Translation cache to avoid duplicate API calls
const translationCache = new Map();
const MAX_CACHE_SIZE = 200;

/**
 * Get API key from chrome.storage
 */
async function getApiKey() {
  const result = await chrome.storage.local.get(['geminiApiKey']);
  return result.geminiApiKey || '';
}

/**
 * Get target language from chrome.storage
 */
async function getTargetLanguage() {
  const result = await chrome.storage.local.get(['targetLanguage']);
  return result.targetLanguage || 'vi'; // Default: Vietnamese
}

/**
 * Call Gemini API to translate text
 */
async function translateText(text, targetLang) {
  // Check cache first
  const cacheKey = `${text}::${targetLang}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: 'API key chưa được cài đặt. Click icon extension để cấu hình.' };
  }

  const languageNames = {
    vi: 'Vietnamese',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese (Simplified)',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    th: 'Thai',
  };

  const langName = languageNames[targetLang] || targetLang;

  const prompt = `Translate the following text to ${langName}. Return ONLY the translated text, nothing else. Do not include quotes or explanations.\n\nText: "${text}"`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;
      console.error('[Meet Translator] Gemini API error:', errMsg);
      return { error: `Lỗi API: ${errMsg}` };
    }

    const data = await response.json();
    const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!translated) {
      return { error: 'Không nhận được bản dịch từ API.' };
    }

    // Cache the result
    if (translationCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = translationCache.keys().next().value;
      translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, { translated });

    return { translated };
  } catch (err) {
    console.error('[Meet Translator] Network error:', err);
    return { error: `Lỗi kết nối: ${err.message}` };
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TRANSLATE') {
    const { text, targetLang } = message;
    translateText(text, targetLang).then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_SETTINGS') {
    Promise.all([getApiKey(), getTargetLanguage()]).then(([apiKey, targetLanguage]) => {
      sendResponse({ apiKey: !!apiKey, targetLanguage });
    });
    return true;
  }
});

// Open popup on install if no API key
chrome.runtime.onInstalled.addListener(async () => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.log('[Meet Translator] Chưa có API key, hãy click icon extension để cấu hình.');
  }
});
