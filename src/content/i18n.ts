interface PanelTextDefaults {
  [key: string]: string
}

let panelTranslations: Record<string, unknown> = {}

const PANEL_TEXT_DEFAULTS: PanelTextDefaults = {
  'panel.title': 'Meet AI Translator',
  'panel.status_waiting': 'Đang chờ...',
  'panel.status_minimized': 'Đã thu nhỏ',
  'panel.status_off': 'Đã tắt',
  'panel.empty_state': 'Đang chờ cuộc hội thoại...',
  'panel.copy_all_title': 'Copy tất cả',
  'panel.copy_single_title': 'Copy bản dịch',
  'panel.copy_all_success': 'Đã copy tất cả',
  'panel.status_collecting': 'Đang chờ hoàn chỉnh',
  'panel.status_translating': 'Đang dịch',
  'panel.status_translated_count': 'Đã dịch {count} câu',
  'panel.status_deduped': 'Đã lọc trùng lặp',
  'panel.status_error_connection': 'Lỗi kết nối',
  'panel.status_error_translation': 'Dịch thất bại',
}

export function t(key: string, params?: Record<string, string>): string {
  const keys = key.split('.')
  let value: unknown = panelTranslations
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k]
  }
  if (!value) {
    value = PANEL_TEXT_DEFAULTS[key] || key
  }
  let result = value as string
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      result = result.replace(`{${paramKey}}`, paramValue)
    })
  }
  return result
}

export function loadPanelTranslations(lang: string): void {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', chrome.runtime.getURL(`lang/${lang}.json`))
  xhr.onload = () => {
    try {
      panelTranslations = JSON.parse(xhr.responseText)
    } catch {
      panelTranslations = {}
    }
  }
  xhr.onerror = () => {
    panelTranslations = {}
  }
  xhr.send()
}

export function getPanelTranslations(): Record<string, unknown> {
  return panelTranslations
}
