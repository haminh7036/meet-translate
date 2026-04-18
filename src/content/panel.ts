import { createElement, Copy, Check, Minimize2, Maximize2 } from 'lucide'
import { t } from './i18n'

function iconToString(iconNode: Parameters<typeof createElement>[0], attrs: Record<string, string | number> = {}): string {
  const svgElement = createElement(iconNode, attrs)
  return svgElement.outerHTML
}

const ICON_COPY = iconToString(Copy, { width: 16, height: 16 })
const ICON_COPY_SMALL = iconToString(Copy, { width: 14, height: 14 })
const ICON_CHECK = iconToString(Check, { width: 14, height: 14, color: '#4ade80' })
const ICON_MINIMIZE = iconToString(Minimize2, { width: 16, height: 16 })
const ICON_MAXIMIZE = iconToString(Maximize2, { width: 16, height: 16 })

export interface TranslationItem {
  original: string
  translated: string | null
  pending?: boolean
}

export interface PanelState {
  container: HTMLDivElement | null
  isMinimized: boolean
  isDragging: boolean
  dragOffsetX: number
  dragOffsetY: number
  items: TranslationItem[]
  pendingItemIndex: number | null | 'flushing'
  savedPosition: { top: number; left: number; width: number }
}

export function createPanelState(): PanelState {
  return {
    container: null,
    isMinimized: false,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    items: [],
    pendingItemIndex: null,
    savedPosition: { top: 0, left: 0, width: 0 },
  }
}

export function createPanel(state: PanelState, onCopyAll: () => void, onToggleMinimize: () => void): void {
  if (state.container) {
    state.container.remove()
  }

  state.container = document.createElement('div')
  state.container.id = 'meet-translate-panel'
  state.container.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 16px;
    width: 340px;
    max-height: 450px;
    background: rgba(30, 30, 30, 0.95);
    color: #e8eaed;
    border-radius: 12px;
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    font-size: 14px;
    z-index: 999999;
    pointer-events: auto;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: max-height 0.2s ease, opacity 0.2s ease;
  `

  const header = document.createElement('div')
  header.id = 'meet-translate-header'
  header.style.cssText = `
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    cursor: grab;
    user-select: none;
  `
  header.addEventListener('mousedown', (e) => startDrag(e, state))

  const titleContainer = document.createElement('div')
  titleContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;'

  const title = document.createElement('span')
  title.id = 'meet-translate-title'
  title.style.cssText = 'font-weight: 600; font-size: 13px; color: #fff;'
  title.textContent = t('panel.title')

  const status = document.createElement('span')
  status.id = 'meet-translate-status'
  status.style.cssText = 'font-size: 11px; color: #8ab4f8;'
  status.textContent = t('panel.status_waiting')

  titleContainer.appendChild(title)
  titleContainer.appendChild(status)

  const actions = document.createElement('div')
  actions.style.cssText = 'display: flex; gap: 6px;'

  const copyAllBtn = document.createElement('button')
  copyAllBtn.id = 'meet-translate-copy-all'
  copyAllBtn.style.cssText = `
    background: none; border: none; color: #9aa0a6; cursor: pointer;
    padding: 4px; border-radius: 4px; display: flex; align-items: center;
    justify-content: center; transition: color 0.15s, background 0.15s;
  `
  copyAllBtn.innerHTML = ICON_COPY
  copyAllBtn.title = t('panel.copy_all_title')
  copyAllBtn.addEventListener('mouseenter', () => {
    copyAllBtn.style.color = '#fff'
    copyAllBtn.style.background = 'rgba(255,255,255,0.1)'
  })
  copyAllBtn.addEventListener('mouseleave', () => {
    copyAllBtn.style.color = '#9aa0a6'
    copyAllBtn.style.background = 'none'
  })
  copyAllBtn.addEventListener('click', onCopyAll)

  const minimizeBtn = document.createElement('button')
  minimizeBtn.id = 'meet-translate-minimize'
  minimizeBtn.style.cssText = `
    background: none; border: none; color: #9aa0a6; cursor: pointer;
    padding: 4px; border-radius: 4px; display: flex; align-items: center;
    justify-content: center; transition: color 0.15s, background 0.15s;
  `
  minimizeBtn.innerHTML = ICON_MINIMIZE
  minimizeBtn.addEventListener('mouseenter', () => {
    minimizeBtn.style.color = '#fff'
    minimizeBtn.style.background = 'rgba(255,255,255,0.1)'
  })
  minimizeBtn.addEventListener('mouseleave', () => {
    minimizeBtn.style.color = '#9aa0a6'
    minimizeBtn.style.background = 'none'
  })
  minimizeBtn.addEventListener('click', onToggleMinimize)

  actions.appendChild(copyAllBtn)
  actions.appendChild(minimizeBtn)
  header.appendChild(titleContainer)
  header.appendChild(actions)

  const content = document.createElement('div')
  content.id = 'meet-translate-content'
  content.style.cssText = `
    flex: 1; overflow-y: auto; padding: 10px 14px;
    display: flex; flex-direction: column; gap: 8px; min-height: 200px;
  `

  const emptyState = document.createElement('div')
  emptyState.id = 'meet-translate-empty'
  emptyState.style.cssText = 'text-align: center; color: #9aa0a6; font-size: 12px; padding: 40px 0;'
  emptyState.textContent = t('panel.empty_state')

  content.appendChild(emptyState)
  state.container.appendChild(header)
  state.container.appendChild(content)

  document.body.appendChild(state.container)
}

function startDrag(e: MouseEvent, state: PanelState): void {
  if ((e.target as Element).closest('button')) return
  state.isDragging = true
  state.dragOffsetX = e.clientX - (state.container as HTMLDivElement).offsetLeft
  state.dragOffsetY = e.clientY - (state.container as HTMLDivElement).offsetTop
  state.container!.style.transition = 'none'
  document.addEventListener('mousemove', (ev) => onDrag(ev, state))
  document.addEventListener('mouseup', () => stopDrag(state))
}

function onDrag(e: MouseEvent, state: PanelState): void {
  if (!state.isDragging) return
  const panelWidth = (state.container as HTMLDivElement).offsetWidth
  const panelHeight = (state.container as HTMLDivElement).offsetHeight
  const newX = Math.max(0, Math.min(e.clientX - state.dragOffsetX, window.innerWidth - panelWidth))
  const newY = Math.max(0, Math.min(e.clientY - state.dragOffsetY, window.innerHeight - panelHeight))
  state.container!.style.left = newX + 'px'
  state.container!.style.top = newY + 'px'
  state.container!.style.right = 'auto'
  state.container!.style.bottom = 'auto'
  state.container!.style.transition = 'none'
}

function stopDrag(state: PanelState): void {
  state.isDragging = false
  state.container!.style.transition = 'none'
  document.removeEventListener('mousemove', (ev) => onDrag(ev, state))
  document.removeEventListener('mouseup', () => stopDrag(state))
}

export function toggleMinimize(state: PanelState): void {
  state.isMinimized = !state.isMinimized
  const content = document.getElementById('meet-translate-content')
  const btn = document.getElementById('meet-translate-minimize')

  if (state.isMinimized) {
    state.container!.style.maxHeight = '44px'
    state.container!.style.transition = 'max-height 0.25s ease, opacity 0.25s ease'
    if (content) content.style.display = 'none'
    if (btn) btn.innerHTML = ICON_MAXIMIZE
    // Store initial position before minimization
    const rect = (state.container as HTMLDivElement).getBoundingClientRect()
    state.savedPosition = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
    }
  } else {
    state.container!.style.maxHeight = '450px'
    state.container!.style.transition = 'max-height 0.25s ease, opacity 0.25s ease'
    if (content) content.style.display = 'flex'
    if (btn) btn.innerHTML = ICON_MINIMIZE
  }
}

export function updateStatus(text: string): void {
  const statusEl = document.getElementById('meet-translate-status')
  if (statusEl) statusEl.textContent = text
}

export function updatePanelTexts(): void {
  const titleEl = document.getElementById('meet-translate-title')
  if (titleEl) titleEl.textContent = t('panel.title')

  const emptyEl = document.getElementById('meet-translate-empty')
  if (emptyEl) emptyEl.textContent = t('panel.empty_state')

  const copyAllBtn = document.getElementById('meet-translate-copy-all')
  if (copyAllBtn) copyAllBtn.title = t('panel.copy_all_title')
}

export function addPendingItemToPanel(originalText: string, state: PanelState): void {
  const emptyEl = document.getElementById('meet-translate-empty')
  if (emptyEl) emptyEl.remove()

  const content = document.getElementById('meet-translate-content')
  if (!content) return

  const itemIndex = state.items.length
  state.items.push({ original: originalText, translated: null, pending: true })
  state.pendingItemIndex = itemIndex

  const item = document.createElement('div')
  item.className = 'translation-item'
  item.setAttribute('data-index', String(itemIndex))
  item.style.cssText = `
    padding: 8px 10px; background: rgba(255, 255, 255, 0.03);
    border-radius: 8px; border-left: 3px solid #fbbf24;
    position: relative; opacity: 0.7;
  `

  const original = document.createElement('div')
  original.className = 'pending-original'
  original.style.cssText = 'font-size: 11px; color: #9aa0a6; margin-bottom: 4px; line-height: 1.4;'
  original.textContent = originalText

  const statusText = document.createElement('div')
  statusText.className = 'pending-status'
  statusText.style.cssText = 'font-size: 12px; color: #fbbf24; line-height: 1.4; font-style: italic;'
  statusText.textContent = t('panel.status_collecting')

  const dots = document.createElement('span')
  dots.className = 'pending-dots'
  dots.style.cssText = 'color: #fbbf24;'
  dots.textContent = ''

  statusText.appendChild(dots)
  item.appendChild(original)
  item.appendChild(statusText)
  content.appendChild(item)

  content.scrollTop = content.scrollHeight

  let dotCount = 0
  const dotInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4
    if (dots.parentNode) {
      dots.textContent = '.'.repeat(dotCount)
    } else {
      clearInterval(dotInterval)
    }
  }, 500)
}

export function updatePendingItemStatus(status: string, state: PanelState): void {
  if (state.pendingItemIndex === null) return
  const item = document.querySelector(`.translation-item[data-index="${state.pendingItemIndex}"]`)
  if (!item) return
  const statusEl = item.querySelector('.pending-status')
  if (statusEl) {
    const dots = statusEl.querySelector('.pending-dots')
    statusEl.textContent = status
    if (dots) statusEl.appendChild(dots)
  }
}

export function finalizePendingItem(translatedText: string, state: PanelState): void {
  if (state.pendingItemIndex === null) return
  const itemIndex = state.pendingItemIndex as number
  state.pendingItemIndex = null

  const item = document.querySelector(`.translation-item[data-index="${itemIndex}"]`)
  if (!item) return

  if (state.items[itemIndex]) {
    state.items[itemIndex].translated = translatedText
    state.items[itemIndex].pending = false
  }

  const statusEl = item.querySelector('.pending-status') as HTMLElement | null
  if (statusEl) {
    const dots = statusEl.querySelector('.pending-dots')
    if (dots) dots.remove()
    statusEl.style.transition = 'color 0.3s ease, font-style 0.3s ease'
    statusEl.style.color = '#e8eaed'
    statusEl.style.fontStyle = 'normal'
    statusEl.style.fontSize = '13px'
    statusEl.style.paddingRight = '28px'
    statusEl.textContent = translatedText
  }

  const originalEl = item.querySelector('.pending-original') as HTMLElement | null
  if (originalEl) {
    originalEl.className = ''
    originalEl.style.cssText = 'font-size: 11px; color: #9aa0a6; margin-bottom: 4px; line-height: 1.4;'
  }

  const panelEl = item as HTMLElement
  panelEl.style.transition = 'border-color 0.3s ease, background 0.3s ease, opacity 0.3s ease'
  panelEl.style.cssText = `
    padding: 8px 10px; background: rgba(255, 255, 255, 0.05);
    border-radius: 8px; border-left: 3px solid #8ab4f8;
    position: relative; cursor: pointer; opacity: 1;
  `

  const copyBtn = document.createElement('button')
  copyBtn.className = 'copy-single-btn'
  copyBtn.style.cssText = `
    position: absolute; top: 6px; right: 6px; background: rgba(255,255,255,0.1);
    border: none; color: #9aa0a6; cursor: pointer; padding: 4px;
    border-radius: 4px; display: flex; align-items: center;
    justify-content: center; opacity: 0; transition: all 0.15s;
  `
  copyBtn.innerHTML = ICON_COPY_SMALL
  copyBtn.title = t('panel.copy_single_title')

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(translatedText).then(() => {
      copyBtn.innerHTML = ICON_CHECK
      copyBtn.style.color = '#4ade80'
      setTimeout(() => {
        copyBtn.innerHTML = ICON_COPY_SMALL
        copyBtn.style.color = '#9aa0a6'
      }, 1500)
    }).catch((err) => {
      console.error('[Meet Translate] Copy failed:', err)
    })
  })

  item.addEventListener('mouseenter', () => { copyBtn.style.opacity = '1' })
  item.addEventListener('mouseleave', () => { copyBtn.style.opacity = '0' })

  item.appendChild(copyBtn)
}

export async function copyAllTranslations(state: PanelState): Promise<void> {
  if (state.items.length === 0) return

  const allText = state.items.map((item) => item.translated).join('\n\n')

  try {
    await navigator.clipboard.writeText(allText)
    updateStatus(t('panel.copy_all_success'))
    setTimeout(() => updateStatus(t('panel.status_waiting')), 2000)
  } catch {
    // silently fail
  }
}
