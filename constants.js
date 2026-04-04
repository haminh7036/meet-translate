const LANGUAGES = {
    vi: 'Vietnamese',
    en: 'English',
    zh: 'Chinese',
    ja: 'Japanese',
};

const EXTENSION_LANGUAGES = {
    vi: 'Tiếng Việt',
    en: 'English',
    zh: '中文',
};

const DEFAULT_LANGUAGE = 'vi';

const DEFAULT_SOURCE_LANGUAGE = 'en';

const GEMINI_API_PLACEHOLDER_KEY = '[ENCRYPTION_KEY]';

const GEMINI_MODEL = 'gemini-2.5-flash';

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_PLACEHOLDER_KEY}`;

const TEMPERATURE = 0.1;

const DEBOUNCE_MS = 500;

const ARIA_LABELS = {
    vi: 'Phụ đề',
    en: 'Captions',
    zh: '字幕',
    ja: '字幕',
};

const CAPTION_SELECTORS = {
    CONTAINER: '[role="region"]',
    BLOCK: '.nMcdL.bj4p3b',
    SPEAKER: '.NWpY1d',
    TEXT: '.ygicle.VbkSUe',
};

const STORAGE_KEYS = {
    SOURCE_LANGUAGE: 'meet_translate_source_language',
    TARGET_LANGUAGE: 'meet_translate_target_language',
    IS_ACTIVE: 'meet_translate_is_active',
    EXTENSION_LANGUAGE: 'meet_translate_extension_language',
    API_KEY: 'meet_translate_api_key',
};

const DEFAULT_STORAGE_VALUES = {
    [STORAGE_KEYS.SOURCE_LANGUAGE]: DEFAULT_SOURCE_LANGUAGE,
    [STORAGE_KEYS.TARGET_LANGUAGE]: DEFAULT_LANGUAGE,
    [STORAGE_KEYS.IS_ACTIVE]: true,
    [STORAGE_KEYS.EXTENSION_LANGUAGE]: DEFAULT_LANGUAGE,
    [STORAGE_KEYS.API_KEY]: '',
};

const PROMPT = {
    SYSTEM: "You are a professional translator. Your task is to translate the text provided by the user from the source language to the target language.\n\nRules:\n1. Translate the text accurately and naturally.\n2. Keep the tone and style of the original text.\n3. If the text contains technical terms, translate them appropriately based on the context.\n4. Keep proper nouns (names of people, places, organizations) unchanged.\n5. Keep numbers, dates, times, and monetary values unchanged.\n6. Keep technical terms and jargon unchanged if they are commonly used in their original form.",
    USER: (text, sourceLanguage, targetLanguage) => `Translate the following text from ${sourceLanguage} to ${targetLanguage}:\n\n${text}\n\nReturn only the translated text, without any additional formatting or explanation.`,
}
