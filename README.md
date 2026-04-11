# Meet Translate

> This extension is a vibe coding project. It works, but at your own risk. Bugs may happen. PRs welcome. 😀

Real-time translation for Google Meet live captions using Gemini AI.

## Features

- **Real-time caption translation** — Translates spoken content as it appears on screen
- **Multi-language support** — Vietnamese, English, Chinese
- **Smart deduplication** — Avoids re-translating the same sentences using IndexedDB
- **Floating panel** — Draggable translation overlay you can position anywhere
- **Persistent settings** — API key and preferences synced across devices

## Requirements

- Google Chrome (or any Chromium-based browser)
- Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Installation

1. Clone this repo
2. Install dependencies:

```bash
npm install
```

3. Build the extension:

```bash
npm run build
```

4. Load in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `dist/` folder

## Usage

1. Click the extension icon in the toolbar
2. Enter your Gemini API key
3. Select your target language
4. Turn on the extension
5. Join a Google Meet call with captions enabled
6. The translation panel will appear automatically

## Commands

| Command | Description |
|--------|-------------|
| `npm run build` | Production build → `dist/` |
| `npm run dev` | Watch mode for development |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check |

## Tech Stack

- **Vite** — Build tool
- **Vue 3** — Popup UI
- **TypeScript** — Type safety
- **TailwindCSS v4** — Styling
- **Gemini API** — Translation

## License

[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
