const isDev = typeof chrome !== 'undefined' && chrome.runtime?.id !== undefined

export const logger = {
  log(...args: unknown[]): void {
    if (isDev) {
      console.log('[Meet Translate]', ...args)
    }
  },

  warn(...args: unknown[]): void {
    if (isDev) {
      console.warn('[Meet Translate]', ...args)
    }
  },

  error(...args: unknown[]): void {
    console.error('[Meet Translate]', ...args)
  },
}
