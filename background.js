importScripts('constants.js');

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildApiUrl(model, apiKey) {
    return `${GEMINI_API_BASE_URL}/${model}:generateContent?key=${apiKey}`;
}

function buildRequestBody(text, sourceLang, targetLang) {
    const sourceLangName = LANGUAGES[sourceLang] || sourceLang;
    const targetLangName = LANGUAGES[targetLang] || targetLang;

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
    };
}

async function callGeminiAPI(text, sourceLang, targetLang, apiKey) {
    const url = buildApiUrl(GEMINI_MODEL, apiKey);
    const body = buildRequestBody(text, sourceLang, targetLang);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
    }

    throw new Error('Invalid response from Gemini API');
}

async function translateWithRetry(text, sourceLang, targetLang, apiKey, maxRetries = 1) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await callGeminiAPI(text, sourceLang, targetLang, apiKey);
            return result;
        } catch (error) {
            lastError = error;
            console.error(`[Meet Translate] Translation attempt ${attempt + 1} failed:`, error.message);

            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    console.error('[Meet Translate] Translation failed after retries:', lastError.message);
    return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Meet Translate] Background received message:', message.type);

    if (message.type !== 'TRANSLATE') return;

    console.log('[Meet Translate] Starting translation for', message.sourceLang, '->', message.targetLang);

    translateWithRetry(message.text, message.sourceLang, message.targetLang, message.apiKey)
        .then((translatedText) => {
            console.log('[Meet Translate] Translation result:', translatedText ? 'success' : 'failed');
            if (translatedText) {
                sendResponse({ success: true, translatedText });
            } else {
                sendResponse({ success: false, error: 'Translation failed after retries' });
            }
        })
        .catch((error) => {
            console.error('[Meet Translate] Translation error:', error);
            sendResponse({ success: false, error: error.message });
        });

    return true;
});
