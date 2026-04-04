# AGENTS.md — Meet AI Translator Chrome Extension

## Project Overview
Vanilla **Chrome Extension (Manifest V3)** that translates Google Meet live captions in real-time using the Gemini API. **No build step, no package manager, no bundler.** Plain HTML/CSS/JS only.

## Architecture
| File | Role |
|---|---|
| `manifest.json` | Extension config (Manifest V3), permissions, script injection |
| `background.js` | Service worker — Gemini API calls, translation caching, message routing |
| `content.js` | Content script — observes Meet caption DOM, renders draggable overlay, sends translation requests |
| `popup.html/js/css` | Settings UI — API key input, language selector, saved to `chrome.storage.local` |
| `styles.css` | Overlay styles injected into Google Meet pages |

## Commands
- **No build/lint/test tooling exists.** No `package.json`, no npm, no TypeScript, no ESLint, no Prettier, no test framework.
- **Load extension:** Open `chrome://extensions/` → Enable Developer Mode → "Load unpacked" → select this folder.
- **Testing:** Manually test in Google Meet with captions enabled. Verify overlay appears, translation works, settings persist.
- **Debugging:** Open Chrome DevTools on `chrome://extensions/` → click "Inspect views: background page" for service worker logs, or inspect the Meet tab's console for content script logs.

## Code Style & Conventions

### Language
- Plain JavaScript (ES6+). No TypeScript. No transpilation.

### Formatting
- 2-space indentation
- Semicolons at end of statements
- Single quotes for strings
- Max line length ~100 chars (flexible)
- Trailing commas in multi-line objects/arrays

### Naming
- `camelCase` for variables and functions
- `UPPER_SNAKE_CASE` for constants (`GEMINI_API_URL`, `MAX_CACHE_SIZE`, `DEBOUNCE_MS`)
- `mt-` prefix for all CSS classes to avoid collisions with Google Meet styles
- `mt-` prefix for DOM element IDs

### Imports / Module Pattern
- No ES module imports. Files are loaded by Chrome manifest.
- `content.js` uses an **IIFE** (`(function() { 'use strict'; ... })()`) to avoid global scope pollution.
- `background.js` and `popup.js` run in their own isolated contexts (service worker / popup).

### Error Handling
- Always `try/catch` around `chrome.runtime.sendMessage` and `fetch` calls.
- Return `{ error: 'message' }` objects from async functions rather than throwing.
- Log errors with `[Meet Translator]` prefix: `console.error('[Meet Translator] ...')`.
- User-facing error messages are in Vietnamese (the default target language).

### Chrome APIs Used
- `chrome.storage.local` — persist API key and target language
- `chrome.runtime.onMessage` / `chrome.runtime.sendMessage` — content ↔ background communication
- `chrome.runtime.onInstalled` — post-install hook
- `chrome.storage.onChanged` — react to settings updates in content script

### Message Protocol
- `TRANSLATE` — `{ type: 'TRANSLATE', text, targetLang }` → `{ translated }` or `{ error }`
- `GET_SETTINGS` — `{ type: 'GET_SETTINGS' }` → `{ apiKey: boolean, targetLanguage: string }`
- Always return `true` from `onMessage` listener for async responses.

### CSS
- All overlay classes use `mt-` prefix (e.g., `.mt-header`, `.mt-body`, `.mt-status`).
- Overlay is positioned fixed and made draggable via mouse events on the header.
- Minimized state toggled via `.mt-minimized` class.
- Glassmorphism style: dark translucent background, blur, subtle borders.

### Language Support
- Supported codes: `vi` (default), `en`, `ja`, `ko`, `zh`, `fr`, `de`, `es`, `th`.
- Language names map defined in `background.js` — update both places when adding a language.

## Adding Features
1. New permissions → add to `manifest.json` `permissions` or `host_permissions`.
2. New settings → store via `chrome.storage.local`, listen via `chrome.storage.onChanged` in `content.js`.
3. New message types → add handler in `background.js` `onMessage` listener.
4. New overlay UI → update `createOverlay()` in `content.js` and `styles.css`.

## Key Implementation Details
- **Translation caching:** In-memory `Map` in `background.js` with max 200 entries (LRU eviction).
- **Debouncing:** 800ms debounce on caption changes to let text stabilize before translating.
- **Caption detection:** Multiple CSS selectors in `CAPTION_SELECTORS` array; Google may change these.
- **Storage keys:** `geminiApiKey` (string), `targetLanguage` (string, default `'vi'`).
- **API endpoint:** `gemini-2.0-flash:generateContent` with temperature 0.1, max 256 tokens.
