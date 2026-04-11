const MAX_HISTORY = 500

let sentenceHistory: IDBDatabase | 'memory' | null = null
const processedSentencesInMemory = new Set<string>()

export function getSentenceHistory(): IDBDatabase | 'memory' | null {
  return sentenceHistory
}

export function setSentenceHistory(val: IDBDatabase | 'memory' | null): void {
  sentenceHistory = val
}

export async function clearSentenceHistory(): Promise<void> {
  if (!sentenceHistory || sentenceHistory === 'memory') {
    processedSentencesInMemory.clear()
    return
  }
  return new Promise((resolve) => {
    const db = sentenceHistory as IDBDatabase
    const tx = db.transaction('sentences', 'readwrite')
    const store = tx.objectStore('sentences')
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function initSentenceHistory(): Promise<void> {
  try {
    const request = indexedDB.open('MeetTranslateDB', 1)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('sentences')) {
        db.createObjectStore('sentences', { keyPath: 'text' })
      }
    }
    request.onsuccess = async (event) => {
      sentenceHistory = (event.target as IDBOpenDBRequest).result
      await clearSentenceHistory()
    }
    request.onerror = () => {
      sentenceHistory = 'memory'
    }
  } catch {
    sentenceHistory = 'memory'
  }
}

export async function isSentenceProcessed(text: string): Promise<boolean> {
  if (!sentenceHistory) return false
  if (sentenceHistory === 'memory') {
    return processedSentencesInMemory.has(text)
  }
  return new Promise((resolve) => {
    const db = sentenceHistory as IDBDatabase
    const tx = db.transaction('sentences', 'readonly')
    const store = tx.objectStore('sentences')
    const request = store.get(text)
    request.onsuccess = () => resolve(!!request.result)
    request.onerror = () => resolve(false)
  })
}

export async function markSentenceProcessed(text: string): Promise<void> {
  if (!sentenceHistory) return
  if (sentenceHistory === 'memory') {
    processedSentencesInMemory.add(text)
    return
  }
  return new Promise((resolve) => {
    const db = sentenceHistory as IDBDatabase
    const tx = db.transaction('sentences', 'readwrite')
    const store = tx.objectStore('sentences')
    store.put({ text, timestamp: Date.now() })
    tx.oncomplete = () => {
      cleanupOldSentences()
      resolve()
    }
    tx.onerror = () => resolve()
  })
}

async function cleanupOldSentences(): Promise<void> {
  if (!sentenceHistory || sentenceHistory === 'memory') return
  const db = sentenceHistory as IDBDatabase
  const tx = db.transaction('sentences', 'readwrite')
  const store = tx.objectStore('sentences')
  const request = store.getAll()
  request.onsuccess = () => {
    const sentences = request.result as Array<{ text: string; timestamp: number }>
    if (sentences.length > MAX_HISTORY) {
      sentences.sort((a, b) => a.timestamp - b.timestamp)
      const toDelete = sentences.slice(0, sentences.length - MAX_HISTORY)
      toDelete.forEach((s) => store.delete(s.text))
    }
  }
}

export function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return []
  const trimmed = text.trim()
  const parts = trimmed.match(/[^。！？.!?]+[。！？.!?]+/g)
  if (!parts) return []
  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

export function normalizeForDedup(text: string): string {
  return text
    .trim()
    .replace(/[。！？.!?]+$/g, '')
    .replace(/[、，,]+/g, '、')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export interface SentenceWithNormalized {
  original: string
  normalized: string
}

export async function deduplicateBeforeSend(sentences: string[]): Promise<SentenceWithNormalized[]> {
  if (sentences.length === 0) return []

  const seen = new Set<string>()
  const result: SentenceWithNormalized[] = []

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue

    const normalized = normalizeForDedup(trimmed)
    if (!normalized) continue

    if (seen.has(normalized)) {
      continue
    }

    const isProcessed = await isSentenceProcessed(normalized)
    if (isProcessed) {
      continue
    }

    seen.add(normalized)
    result.push({ original: trimmed, normalized })
  }

  return result
}
