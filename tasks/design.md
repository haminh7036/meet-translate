# Meet AI Translator — Technical Design Document

## Overview

Chrome Extension (Manifest V3) dịch phụ đề Google Meet theo thời gian thực bằng Gemini AI. Thay thế trực tiếp text gốc trong DOM bằng bản dịch, giữ nguyên speaker name và style mặc định của Google Meet.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Meet DOM                          │
│  [role="region"][aria-label*="Captions/Phụ đề"]             │
│    └─ .nMcdL.bj4p3b (caption block)                         │
│         ├─ .NWpY1d (speaker name) → GIỮ NGUYÊN              │
│         └─ .ygicle.VbkSUe (caption text) → DỊCH & THAY THẾ  │
└─────────────────────────────────────────────────────────────┘
                            │
                    MutationObserver
                            │
                    debounce(500ms)
                            │
              ┌─────────────┴─────────────┐
              │      content.js           │
              │  - Detect caption changes │
              │  - Extract text           │
              │  - Check supported lang   │
              │  - Replace with result    │
              └─────────────┬─────────────┘
                            │ chrome.runtime.sendMessage
                            ▼
              ┌─────────────────────────┐
              │      background.js      │
              │  - Call Gemini API      │
              │  - Retry 1 lần nếu lỗi  │
              │  - Return translated    │
              └─────────────┬───────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │      popup.html/js/css  │
              │  - API Key input        │
              │  - Source/Target lang   │
              │  - On/Off toggle        │
              └─────────────────────────┘
```

---

## Caption Detection Strategy

### 1. Container Detection

**Primary: ARIA selectors** (ổn định nhất, không bị obfuscate)

Dựa vào `<html lang="vi">` hoặc `<html lang="en">` để xác định `aria-label`:

| html lang | aria-label |
|-----------|------------|
| `vi` | `Phụ đề` |
| `en` | `Captions` |
| `zh` | `字幕` |
| `ja` | `字幕` |

```javascript
const htmlLang = document.documentElement.lang;
const ariaLabel = ARIA_LABELS[htmlLang] || 'Captions';
const container = document.querySelector(
    `[role="region"][aria-label*="${ariaLabel}"]`
);
```

**Fallback:** `[role="region"]` — nếu aria-label không khớp

### 2. Caption Block Structure

```html
<div class="nMcdL bj4p3b">
  <div class="adE6rb">
    <img class="Z6byG r6DyN" alt="" src="avatar-url">
    <div class="KcIKyf jxFHg">
      <span class="NWpY1d">Bản trình bày của Minh Hà</span>
    </div>
  </div>
  <div class="ygicle VbkSUe">会話1。これから帰るけど...</div>
</div>
```

**Selectors:**
- Block container: `.nMcdL.bj4p3b`
- Speaker name: `.NWpY1d` → **GIỮ NGUYÊN**
- Caption text: `.ygicle.VbkSUe` → **DỊCH VÀ THAY THẾ**

### 3. Multi-Speaker Support

Google Meet có thể hiển thị nhiều caption blocks cùng lúc (nhiều người nói). Content.js sẽ loop qua tất cả `.nMcdL.bj4p3b` blocks và xử lý từng cái riêng biệt.

---

## Translation Pipeline

### Step 1: MutationObserver

```javascript
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        const blocks = container.querySelectorAll(CAPTION_SELECTORS.BLOCK);
        for (const block of blocks) {
            processCaptionBlock(block);
        }
    }
});
observer.observe(container, { childList: true, subtree: true, characterData: true });
```

### Step 2: Extract Text

```javascript
function extractCaptionText(block) {
    const textEl = block.querySelector(CAPTION_SELECTORS.TEXT);
    return textEl ? textEl.textContent.trim() : null;
}
```

### Step 3: Debounce (500ms)

Chờ 500ms sau khi text thay đổi để đảm bảo câu đã hoàn chỉnh, tránh dịch partial captions.

```javascript
const debouncedTranslate = debounce((block) => {
    const text = extractCaptionText(block);
    if (text && isSupportedLanguage(text)) {
        sendForTranslation(text, block);
    }
}, 500);
```

### Step 4: Language Detection

Kiểm tra xem caption có phải là ngôn ngữ đã cài đặt (vi, en, zh, ja) không. Nếu không phải → bỏ qua.

```javascript
function isSupportedLanguage(text) {
    // Dùng heuristic đơn giản: kiểm tra xem text có chứa ký tự đặc trưng
    // của ngôn ngữ đã cài đặt không
    const supportedLangs = Object.keys(LANGUAGES);
    // TODO: Implement language detection logic
    return true; // Tạm thời cho phép tất cả
}
```

### Step 5: Send to Background

```javascript
chrome.runtime.sendMessage({
    type: 'TRANSLATE',
    text: text,
    sourceLang: sourceLanguage,
    targetLang: targetLanguage,
}, (response) => {
    if (response && response.translatedText) {
        replaceCaptionText(block, response.translatedText);
    }
});
```

### Step 6: Replace in DOM

```javascript
function replaceCaptionText(block, translatedText) {
    const textEl = block.querySelector(CAPTION_SELECTORS.TEXT);
    if (textEl) {
        textEl.textContent = translatedText;
    }
}
```

---

## Error Handling

### Gemini API Retry Logic

```javascript
async function translateWithRetry(text, sourceLang, targetLang, apiKey, maxRetries = 1) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await callGeminiAPI(text, sourceLang, targetLang, apiKey);
            return result;
        } catch (error) {
            if (attempt === maxRetries) {
                console.error('Translation failed after retries:', error);
                return null; // Giữ nguyên text gốc
            }
            await sleep(1000); // Chờ 1s trước khi retry
        }
    }
}
```

### Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| API key không hợp lệ | Giữ nguyên text gốc, log warning |
| Network timeout | Retry 1 lần, vẫn lỗi → giữ nguyên text gốc |
| Gemini trả về lỗi | Retry 1 lần, vẫn lỗi → giữ nguyên text gốc |
| Caption không phải ngôn ngữ hỗ trợ | Bỏ qua, không dịch |
| Không tìm thấy caption container | Log warning, retry sau 5s |

---

## Constants

### Languages

```javascript
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
```

### ARIA Labels

```javascript
const ARIA_LABELS = {
    vi: 'Phụ đề',
    en: 'Captions',
    zh: '字幕',
    ja: '字幕',
};
```

### Caption Selectors

```javascript
const CAPTION_SELECTORS = {
    CONTAINER: '[role="region"]',
    BLOCK: '.nMcdL.bj4p3b',
    SPEAKER: '.NWpY1d',
    TEXT: '.ygicle.VbkSUe',
};
```

### Gemini API

```javascript
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_PLACEHOLDER_KEY}`;
const TEMPERATURE = 0.1;
const DEBOUNCE_MS = 500;
```

### Prompt

**System Prompt:**
```
You are a professional translator. Your task is to translate the text provided by the user from the source language to the target language.

Rules:
1. Translate the text accurately and naturally.
2. Keep the tone and style of the original text.
3. If the text contains technical terms, translate them appropriately based on the context.
4. Keep proper nouns (names of people, places, organizations) unchanged.
5. Keep numbers, dates, times, and monetary values unchanged.
6. Keep technical terms and jargon unchanged if they are commonly used in their original form.
```

**User Prompt:**
```
Translate the following text from {sourceLanguage} to {targetLanguage}:

{text}

Return only the translated text, without any additional formatting or explanation.
```

### Storage Keys

```javascript
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
```

---

## File Structure

```
meet-translate/
├── manifest.json          # Manifest V3 config
├── constants.js           # All constants (selectors, languages, prompts, etc.)
├── content.js             # Content script: detect captions, replace with translations
├── background.js          # Service worker: call Gemini API, handle retries
├── popup.html             # Settings popup UI
├── popup.js               # Popup logic: load/save settings
├── popup.css              # Popup styles
├── lang/
│   ├── en.json            # English localization
│   ├── vi.json            # Vietnamese localization
│   └── zh.json            # Chinese localization
└── tasks/
    ├── todo.md            # Task tracking
    ├── lessons.md         # Lessons learned
    └── design.md          # This file
```

**Note:** `styles.css` đã bị xóa — extension dùng style mặc định của Google Meet cho captions.

---

## Popup UI Specification

### Layout

```
┌─────────────────────────────────┐
│  Meet AI Translator             │
├─────────────────────────────────┤
│  🔑 API Key Gemini              │
│  [________________________________] │
│                                 │
│  🌐 Ngôn ngữ gốc                │
│  [English ▼]                    │
│                                 │
│  🎯 Ngôn ngữ đích               │
│  [Tiếng Việt ▼]                 │
│                                 │
│  💻 Ngôn ngữ extension          │
│  [Tiếng Việt ▼]                 │
│                                 │
│  ⚡ Trạng thái: [BẬT/TẮT]       │
│                                 │
│  [💾 Lưu]  [❌ Huỷ]             │
└─────────────────────────────────┘
```

### Behavior

1. **Mở popup:** Load settings từ `chrome.storage`
2. **Nhấn Lưu:** Validate API key (không rỗng), save settings, close popup
3. **Nhấn Huỷ:** Đóng popup không lưu
4. **Toggle Bật/Tắt:** Cập nhật `IS_ACTIVE` trong storage

---

## Message Protocol

### Content → Background

```javascript
{
    type: 'TRANSLATE',
    text: '会話1。これから帰るけど...',
    sourceLang: 'ja',
    targetLang: 'vi',
}
```

### Background → Content

```javascript
{
    success: true,
    translatedText: 'Cuộc hội thoại 1. Mình sắp về rồi, có cần mua gì không?',
}
```

### Error Response

```javascript
{
    success: false,
    error: 'API key không hợp lệ',
}
```

---

## Limitations & Known Issues

1. **Class names obfuscated:** `.nMcdL.bj4p3b`, `.ygicle.VbkSUe` có thể thay đổi khi Google update. ARIA selectors là fallback chính.
2. **Language detection heuristic:** Chưa có cách chính xác 100% để detect ngôn ngữ của caption. Hiện tại dựa vào LANGUAGES constant.
3. **Caption container detection:** Dựa vào `<html lang>` để xác định aria-label. Nếu Google thay đổi aria-label → cần update ARIA_LABELS constant.
4. **No transcript storage:** Chỉ dịch realtime, không lưu lại transcript.

---

## Future Improvements

1. **Auto language detection:** Dùng API hoặc heuristic để tự động detect ngôn ngữ của caption
2. **Transcript history:** Lưu transcript đã dịch để xem lại sau
3. **Export transcript:** Xuất transcript đã dịch ra file TXT/SRT
4. **Custom prompt:** Cho phép user tùy chỉnh prompt dịch thuật
5. **Multiple translation providers:** Hỗ trợ thêm DeepL, OpenAI, v.v.
