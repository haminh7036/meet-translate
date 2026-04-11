import { ARIA_LABELS, CAPTION_SELECTORS } from '../constants'
import { logger } from './logger'

let captionContainer: Element | null = null

export function getCaptionContainer(): Element | null {
  return captionContainer
}

export function setCaptionContainer(el: Element | null): void {
  captionContainer = el
}

export function getAriaLabel(): string {
  const htmlLang = document.documentElement.lang || 'en'
  return ARIA_LABELS[htmlLang] || ARIA_LABELS['en']
}

export function isValidCaptionContainer(container: Element): boolean {
  if (!container) return false
  const hasCaptionBlocks = container.querySelectorAll(CAPTION_SELECTORS.BLOCK).length > 0
  const hasTextElements = container.querySelectorAll(CAPTION_SELECTORS.TEXT).length > 0
  const ariaLabel = container.getAttribute('aria-label') || ''
  if (!hasCaptionBlocks && !hasTextElements) {
    logger.warn('Invalid container, aria-label:', ariaLabel, 'blocks:', hasCaptionBlocks, 'text:', hasTextElements)
  }
  return hasCaptionBlocks || hasTextElements
}

export function findCaptionContainerByAriaLabel(ariaLabel: string): Element | null {
  const regions = document.querySelectorAll('[role="region"]')
  for (const region of regions) {
    const label = region.getAttribute('aria-label') || ''
    if (label.includes(ariaLabel) && isValidCaptionContainer(region)) {
      return region
    }
  }
  return null
}

export function getBlockKey(textEl: Element): string {
  const block = textEl.closest(CAPTION_SELECTORS.BLOCK)
  if (!block) return `unknown::${textEl.textContent?.substring(0, 20) || ''}`

  const speakerEl = block.querySelector(CAPTION_SELECTORS.SPEAKER)
  const speakerName = speakerEl ? speakerEl.textContent?.trim() || 'unknown' : 'unknown'
  const container = getCaptionContainer()
  const allBlocks = container
    ? Array.from(container.querySelectorAll(CAPTION_SELECTORS.BLOCK))
    : []
  const index = allBlocks.indexOf(block)
  return `speaker:${speakerName}::index:${index}`
}

export function getSpeakerName(textEl: Element): string {
  const block = textEl.closest(CAPTION_SELECTORS.BLOCK)
  if (!block) return 'unknown'
  const speakerEl = block.querySelector(CAPTION_SELECTORS.SPEAKER)
  return speakerEl?.textContent?.trim() || 'unknown'
}
