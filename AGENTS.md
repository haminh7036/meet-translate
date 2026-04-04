# AGENTS.md — Meet AI Translator Chrome Extension

## Project Overview
Vanilla **Chrome Extension (Manifest V3)** that translates Google Meet live captions in real-time using the Gemini API. **No build step, no package manager, no bundler.** Plain HTML/CSS/JS only.

## Build / Lint / Test

- **No build step** — load the extension directly in Chrome via `chrome://extensions` → "Load unpacked" → select project root.
- **No linter** — follow conventions below manually.
- **No test framework** — verify by loading the extension in Chrome and opening a Google Meet call with captions enabled.
- **Manual testing checklist**:
  1. Set a valid Gemini API key in the popup
  2. Enable captions in Google Meet
  3. Confirm the translation panel appears and shows translated text
  4. Check Chrome DevTools console (`[Meet Translate]` prefixed logs) for errors

## File Structure

```
manifest.json       — Extension config (Manifest V3)
constants.js        — Shared constants (languages, selectors, storage keys, prompts)
background.js       — Service worker: handles Gemini API calls
content.js          — Content script: detects captions, manages translation panel
popup.html/css/js   — Extension settings popup
lang/*.json         — i18n translation files for the popup UI
```

## Code Style

### Formatting
- **Indentation**: 4 spaces (no tabs)
- **Semicolons**: Always required
- **Quotes**: Single quotes for strings, backticks for template literals
- **Line length**: No hard limit, but keep lines reasonable (~100 chars)
- **Trailing commas**: Not used

### Naming Conventions
- **Variables/functions**: `camelCase` (e.g., `translateWithRetry`, `captionContainer`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `STORAGE_KEYS`, `DEFAULT_LANGUAGE`)
- **CSS classes**: `kebab-case` (e.g., `.popup-header`, `.form-input`)
- **DOM IDs**: `kebab-case` with `meet-translate-` prefix (e.g., `meet-translate-panel`)
- **Log prefix**: Always `[Meet Translate]` for console output

### Module Pattern
- Use **IIFE** `(function () { 'use strict'; ... })();` for content scripts and popup scripts
- Use `importScripts('constants.js')` in the service worker to share constants
- Load `constants.js` via `<script>` tag in HTML before dependent scripts

### Imports / Dependencies
- **No external dependencies** — vanilla JS only
- Shared constants flow: `constants.js` → loaded by all scripts
- Chrome APIs used: `chrome.runtime`, `chrome.storage`, `chrome.runtime.onMessage`

### Types
- No TypeScript — plain JavaScript
- Validate inputs at boundaries (API responses, storage values, DOM elements)
- Use optional chaining (`?.`) and nullish coalescing (`||`) for safe access

### Error Handling
- Use `try/catch` for async operations (IndexedDB, clipboard, fetch)
- Log errors with `console.error('[Meet Translate]', error)`
- Never throw uncaught errors in content scripts — they break the page
- API errors: return `{ success: false, error: message }` via `sendResponse`
- Use retry logic for transient failures (see `translateWithRetry`)

### DOM Manipulation
- Create elements via `document.createElement`, not `innerHTML` (except SVG icons)
- Inline styles via `element.style.cssText` for dynamically created panel elements
- Use CSS classes + external stylesheet for popup UI
- Always check element existence before accessing properties

### Chrome Extension APIs
- **Storage**: `chrome.storage.sync.get/set` for user settings
- **Messaging**: `chrome.runtime.sendMessage` (content → background), `chrome.runtime.onMessage` listener
- **Service worker**: Use `return true` in `onMessage` to keep `sendResponse` alive for async responses
- **Permissions**: Only `storage` + host permissions for `meet.google.com` and Gemini API

### CSS Conventions
- CSS custom properties in `:root` for theming
- BEM-ish naming: `.block__element--modifier` simplified to `.block-element`
- Mobile-first not needed (popup is fixed 340px width)
- Use `var(--color-*)` consistently, never hardcode colors outside `:root`

### i18n
- Popup UI uses `data-i18n` and `data-i18n-placeholder` attributes
- Translation files live in `lang/<code>.json` with nested key structure
- Extension language is user-selectable (vi, en, zh)

## Key Architectural Patterns

1. **Caption detection**: Polls DOM for Google Meet caption containers using known CSS selectors
2. **Stability debounce**: Waits 3s for caption text to stabilize before sending for translation
3. **Deduplication**: Uses IndexedDB (with in-memory fallback) to avoid re-translating same sentences
4. **Batching**: Buffers sentences until threshold (5) is reached before sending to background
5. **Translation panel**: Floating draggable UI overlay created dynamically in content script

## Adding New Features

1. Add new constants to `constants.js`
2. If API call needed → modify `background.js` message handler
3. If UI needed → modify `content.js` panel creation or `popup.*` files
4. If new setting → add to `STORAGE_KEYS`, update popup form, add to `loadSettings`/`saveSettings`
5. If new language → add to `LANGUAGES`/`EXTENSION_LANGUAGES` in `constants.js` and create `lang/<code>.json`
