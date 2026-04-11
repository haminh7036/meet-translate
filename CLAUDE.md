# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) that translates Google Meet live captions in real-time using the Gemini AI API. Built with **Vite + Vue 3 + TypeScript + TailwindCSS v4**.

## Build / Dev Commands

```bash
npm run build        # Production build → dist/
npm run dev          # Watch mode (Vite builds on change)
npm run build:watch  # Alternative watch mode
npm run lint         # ESLint check
npm run typecheck    # vue-tsc type checking (no emit)
```

**Loading the extension**: `chrome://extensions` → "Load unpacked" → select `dist/`.

## Architecture

The extension has three main parts communicating via Chrome's message passing:

```
┌─────────────────┐   TRANSLATE msg   ┌──────────────────┐
│  Content Script  │ ────────────────► │  Background SW   │
│  (meet.google.com)                  │  (Gemini API)    │
└────────┬────────┘                   └──────────────────┘
         │
         ▼
┌─────────────────┐                   ┌──────────────────┐
│  Floating Panel  │                  │  Popup UI (Vue)  │
│  (DOM overlay)   │                  │  Settings screen  │
└─────────────────┘                   └──────────────────┘
```

### Key files

| File | Role |
|---|---|
| `src/background.ts` | Service worker — receives `TRANSLATE` messages, calls Gemini API with retry logic |
| `src/content/index.ts` | Content script entry — orchestrates caption polling, sentence buffering, and translation flow |
| `src/content/captions.ts` | Detects and extracts caption containers from Google Meet DOM |
| `src/content/sentences.ts` | Sentence splitting, deduplication via IndexedDB (with in-memory fallback) |
| `src/content/panel.ts` | Creates/manages the draggable floating translation panel UI (vanilla DOM) |
| `src/content/settings.ts` | Loads/watches `chrome.storage` for settings changes |
| `src/content/i18n.ts` | Panel text translations (loaded from `lang/*.json`) |
| `src/content/logger.ts` | Conditional logging (only in dev mode) |
| `src/popup/App.vue` | Settings UI — API key, language selection, on/off toggle |
| `src/constants.ts` | Shared constants — language codes, CSS selectors, storage keys, Gemini prompt config |

### Data flow

1. Content script polls Meet captions every 500ms using CSS selectors (`CAPTION_SELECTORS` in constants)
2. Caption text stability is detected after 5s debounce; new sentences are extracted by diffing against previous stable text
3. Sentences are buffered and flushed on speaker change or 12s silence timeout
4. Before sending, sentences are deduplicated against IndexedDB history
5. Batch is sent to background service worker via `chrome.runtime.sendMessage`
6. Background calls Gemini API, returns translation
7. Translation appears in the floating panel

### Storage

- `chrome.storage.local`: API key (security-sensitive, not synced)
- `chrome.storage.sync`: language settings, active toggle (synced across devices)

## Code Style

- **Formatting**: 2-space indent, single quotes, no semicolons (ASI)
- **Naming**: `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants
- **Types**: Strict TypeScript with `@types/chrome`; validate inputs at boundaries
- **DOM**: Use `document.createElement` with inline `cssText` for content script panel; Vue SFC + TailwindCSS for popup
- **Errors**: `try/catch` for async ops; log with `[Meet Translate]` prefix; never throw uncaught in content scripts
- **i18n**: Translation files in `public/lang/<code>.json` (vi, en, zh); add new languages to `LANGUAGES`/`EXTENSION_LANGUAGES` in constants
