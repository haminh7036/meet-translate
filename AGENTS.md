# AGENTS.md — Meet AI Translator Chrome Extension

## Project Overview
Chrome Extension (Manifest V3) built with **Vite + Vue 3 + TypeScript + TailwindCSS v4** that translates Google Meet live captions in real-time using the Gemini API.

## Build / Dev / Test

```bash
npm run build        # Production build → dist/
npm run dev          # Watch mode for development
```

Load the extension in Chrome via `chrome://extensions` → "Load unpacked" → select `dist/` folder.

**Manual testing checklist**:
1. Run `npm run build`
2. Load `dist/` as unpacked extension in Chrome
3. Set a valid Gemini API key in the popup
4. Enable captions in Google Meet
5. Confirm the translation panel appears and shows translated text
6. Check Chrome DevTools console (`[Meet Translate]` prefixed logs) for errors

## File Structure

```
manifest.json              — Extension config (Manifest V3, source for vite-plugin-web-extension)
vite.config.ts             — Vite + web-extension plugin config
tsconfig.json              — TypeScript configuration
package.json               — Dependencies and scripts
public/
  lang/*.json              — i18n translation files (copied to dist/ as public assets)
src/
  constants.ts             — Shared constants (languages, selectors, storage keys, prompts)
  background.ts            — Service worker: handles Gemini API calls
  popup/
    index.html             — Popup HTML template
    main.ts                — Vue app entry point
    App.vue                — Popup Vue component (TailwindCSS styled)
    style.css              — TailwindCSS import
  content/
    index.ts               — Content script entry, connects all modules
    captions.ts            — Google Meet caption detection via DOM polling
    sentences.ts           — Sentence extraction, deduplication, batching
    panel.ts               — Floating draggable translation panel UI
    i18n.ts                — Panel translations loader
    settings.ts            — User settings via chrome.storage
    logger.ts              — Console logging with prefix
```

## Code Style

### Formatting
- **Indentation**: 2 spaces (standard for Vue/TS ecosystem)
- **Semicolons**: Not required (ASI)
- **Quotes**: Single quotes for strings, backticks for template literals
- **Line length**: No hard limit, but keep lines reasonable (~100 chars)

### Naming Conventions
- **Variables/functions**: `camelCase` (e.g., `translateWithRetry`, `captionContainer`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `STORAGE_KEYS`, `DEFAULT_LANGUAGE`)
- **CSS classes**: Tailwind utility classes (no custom CSS needed for popup)
- **DOM IDs**: `kebab-case` with `meet-translate-` prefix (e.g., `meet-translate-panel`)
- **Log prefix**: Always `[Meet Translate]` for console output

### Module Pattern
- **Vue SFC** for popup UI (`src/popup/App.vue`)
- **ES modules** for all TypeScript files
- Shared constants via `import` from `constants.ts`
- Chrome APIs used: `chrome.runtime`, `chrome.storage`, `chrome.runtime.onMessage`

### Types
- Full TypeScript with strict mode
- `@types/chrome` for Chrome Extension API types
- Validate inputs at boundaries (API responses, storage values, DOM elements)
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safe access

### Error Handling
- Use `try/catch` for async operations (IndexedDB, clipboard, fetch)
- Log errors with `console.error('[Meet Translate]', error)`
- Never throw uncaught errors in content scripts — they break the page
- API errors: return `{ success: false, error: message }` via `sendResponse`
- Use retry logic for transient failures (see `translateWithRetry`)

### DOM Manipulation
- **Content script**: `document.createElement` for dynamic panel elements (no Vue in content script)
- **Popup**: Vue SFC with TailwindCSS classes
- Inline styles via `element.style.cssText` for dynamically created panel elements
- Always check element existence before accessing properties

### Chrome Extension APIs
- **Storage**: `chrome.storage.sync.get/set` for user settings, `chrome.storage.local` for API key
- **Messaging**: `chrome.runtime.sendMessage` (content → background), `chrome.runtime.onMessage` listener
- **Service worker**: Use `return true` in `onMessage` to keep `sendResponse` alive for async responses
- **Permissions**: Only `storage` + host permissions for `meet.google.com` and Gemini API

### TailwindCSS
- Uses `@tailwindcss/vite` plugin (TailwindCSS v4)
- Inline utility classes in Vue templates
- Custom CSS only for animations (`@keyframes`) in Vue `<style scoped>`
- Never hardcode colors — use Tailwind's color palette

### i18n
- Popup UI uses Vue `t()` function with nested key structure
- Translation files live in `public/lang/<code>.json`
- Extension language is user-selectable (vi, en, zh)
- Content script panel uses `loadPanelTranslations()` via XHR

## Key Architectural Patterns

1. **Caption detection**: Polls DOM for Google Meet caption containers using known CSS selectors
2. **Stability debounce**: Waits 5s for caption text to stabilize before sending for translation
3. **Deduplication**: Uses IndexedDB (with in-memory fallback) to avoid re-translating same sentences
4. **Batching**: Buffers sentences until threshold is reached before sending to background
5. **Translation panel**: Floating draggable UI overlay created dynamically in content script
6. **Vue popup**: Settings UI built with Vue 3 SFC + TailwindCSS, built by Vite

## Adding New Features

1. Add new constants to `src/constants.ts`
2. If API call needed → modify `src/background.ts` message handler
3. If UI needed → modify `src/popup/App.vue` or `src/content/panel.ts` panel creation
4. If new setting → add to `STORAGE_KEYS`, update popup form, add to `loadSettings`/`saveSettings` in `src/content/settings.ts`
5. If new language → add to `LANGUAGES`/`EXTENSION_LANGUAGES` in `src/constants.ts` and create `public/lang/<code>.json`
