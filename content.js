console.log('[Meet Translate] Content script loaded!');

(function () {
    'use strict';

    let captionContainer = null;
    let isActive = true;
    let sourceLanguage = DEFAULT_SOURCE_LANGUAGE;
    let targetLanguage = DEFAULT_LANGUAGE;
    let apiKey = '';
    let retryTimer = null;
    const RETRY_INTERVAL_MS = 3000;
    const POLL_INTERVAL_MS = 500;
    const STABLE_DEBOUNCE_MS = 5000;
    const POST_EXTRACT_COOLDOWN_MS = 3000;
    const SILENCE_TIMEOUT_MS = 12000;
    const MAX_HISTORY = 500;
    const blockState = new Map();
    let panelContainer = null;
    let pollingTimer = null;
    let sentenceBuffer = [];
    let isTranslating = false;
    let isMinimized = false;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let sentenceHistory = null;
    const processedSentencesInMemory = new Set();
    const translationItems = [];
    let activeSpeaker = null;
    let lastCaptionTime = 0;
    let silenceTimer = null;
    let pendingItemIndex = null;
    let panelLang = DEFAULT_LANGUAGE;
    let panelTranslations = {};

    const PANEL_TEXT_DEFAULTS = {
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
    };

    function t(key, params) {
        const keys = key.split('.');
        let value = panelTranslations;
        for (const k of keys) {
            value = value?.[k];
        }
        if (!value) {
            value = PANEL_TEXT_DEFAULTS[key] || key;
        }
        if (params) {
            Object.entries(params).forEach(([paramKey, paramValue]) => {
                value = value.replace(`{${paramKey}}`, paramValue);
            });
        }
        return value;
    }

    function loadPanelTranslations(lang) {
        panelLang = lang;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', chrome.runtime.getURL(`lang/${lang}.json`));
        xhr.onload = () => {
            try {
                panelTranslations = JSON.parse(xhr.responseText);
                updatePanelTexts();
            } catch (e) {
                console.error('[Meet Translate] Failed to parse panel translations:', e);
            }
        };
        xhr.onerror = () => {
            console.error('[Meet Translate] Failed to load panel translations');
        };
        xhr.send();
    }

    function updatePanelTexts() {
        const titleEl = document.getElementById('meet-translate-title');
        if (titleEl) titleEl.textContent = t('panel.title');

        updateStatus(t('panel.status_waiting'));

        const emptyEl = document.getElementById('meet-translate-empty');
        if (emptyEl) emptyEl.textContent = t('panel.empty_state');

        const copyAllBtn = document.getElementById('meet-translate-copy-all');
        if (copyAllBtn) copyAllBtn.title = t('panel.copy_all_title');
    }

    function getAriaLabel() {
        const htmlLang = document.documentElement.lang || 'en';
        return ARIA_LABELS[htmlLang] || ARIA_LABELS['en'];
    }

    function clearRetryTimer() {
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
    }

    function isValidCaptionContainer(container) {
        if (!container) return false;
        const hasCaptionBlocks = container.querySelectorAll(CAPTION_SELECTORS.BLOCK).length > 0;
        const hasTextElements = container.querySelectorAll(CAPTION_SELECTORS.TEXT).length > 0;
        return hasCaptionBlocks || hasTextElements;
    }

    function findCaptionContainerByAriaLabel(ariaLabel) {
        const regions = document.querySelectorAll('[role="region"]');
        for (const region of regions) {
            const label = region.getAttribute('aria-label') || '';
            if (label.includes(ariaLabel) && isValidCaptionContainer(region)) {
                return region;
            }
        }
        return null;
    }

    function detectCaptionContainer() {
        if (captionContainer && document.body.contains(captionContainer) && isValidCaptionContainer(captionContainer)) {
            return true;
        }

        const ariaLabel = getAriaLabel();
        captionContainer = findCaptionContainerByAriaLabel(ariaLabel);

        if (!captionContainer) {
            const regions = document.querySelectorAll('[role="region"]');
            for (const region of regions) {
                if (isValidCaptionContainer(region)) {
                    captionContainer = region;
                    break;
                }
            }
        }

        if (!captionContainer) {
            console.warn('[Meet Translate] No valid caption container found. Will retry in', RETRY_INTERVAL_MS / 1000, 's...');
            clearRetryTimer();
            retryTimer = setTimeout(() => {
                const found = detectCaptionContainer();
                if (found) startPolling();
            }, RETRY_INTERVAL_MS);
            return false;
        }

        console.log('[Meet Translate] Found caption container');
        clearRetryTimer();
        return true;
    }

    function splitIntoSentences(text) {
        if (!text || !text.trim()) return [];
        const trimmed = text.trim();
        const parts = trimmed.match(/[^。！？.!?]+[。！？.!?]+/g);
        if (!parts) return [];
        return parts.map((p) => p.trim()).filter((p) => p.length > 0);
    }

    async function clearSentenceHistory() {
        if (!sentenceHistory || sentenceHistory === 'memory') {
            processedSentencesInMemory.clear();
            return;
        }
        return new Promise((resolve) => {
            const tx = sentenceHistory.transaction('sentences', 'readwrite');
            const store = tx.objectStore('sentences');
            store.clear();
            tx.oncomplete = () => {
                console.log('[Meet Translate] Sentence history cleared');
                resolve();
            };
            tx.onerror = () => resolve();
        });
    }

    async function initSentenceHistory() {
        try {
            const request = indexedDB.open('MeetTranslateDB', 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('sentences')) {
                    db.createObjectStore('sentences', { keyPath: 'text' });
                }
            };
            request.onsuccess = async (event) => {
                sentenceHistory = event.target.result;
                console.log('[Meet Translate] IndexedDB initialized');
                await clearSentenceHistory();
            };
            request.onerror = () => {
                console.warn('[Meet Translate] IndexedDB failed, using in-memory fallback');
                sentenceHistory = 'memory';
            };
        } catch (e) {
            console.warn('[Meet Translate] IndexedDB not available, using in-memory fallback');
            sentenceHistory = 'memory';
        }
    }

    async function isSentenceProcessed(text) {
        if (!sentenceHistory) return false;
        if (sentenceHistory === 'memory') {
            return processedSentencesInMemory.has(text);
        }
        return new Promise((resolve) => {
            const tx = sentenceHistory.transaction('sentences', 'readonly');
            const store = tx.objectStore('sentences');
            const request = store.get(text);
            request.onsuccess = () => resolve(!!request.result);
            request.onerror = () => resolve(false);
        });
    }

    async function markSentenceProcessed(text) {
        if (!sentenceHistory) return;
        if (sentenceHistory === 'memory') {
            processedSentencesInMemory.add(text);
            return;
        }
        return new Promise((resolve) => {
            const tx = sentenceHistory.transaction('sentences', 'readwrite');
            const store = tx.objectStore('sentences');
            store.put({ text, timestamp: Date.now() });
            tx.oncomplete = () => {
                cleanupOldSentences();
                resolve();
            };
            tx.onerror = () => resolve();
        });
    }

    async function cleanupOldSentences() {
        if (!sentenceHistory || sentenceHistory === 'memory') return;
        const tx = sentenceHistory.transaction('sentences', 'readwrite');
        const store = tx.objectStore('sentences');
        const request = store.getAll();
        request.onsuccess = () => {
            const sentences = request.result;
            if (sentences.length > MAX_HISTORY) {
                sentences.sort((a, b) => a.timestamp - b.timestamp);
                const toDelete = sentences.slice(0, sentences.length - MAX_HISTORY);
                toDelete.forEach((s) => store.delete(s.text));
            }
        };
    }

    function createPanel() {
        if (panelContainer) {
            panelContainer.remove();
        }

        panelContainer = document.createElement('div');
        panelContainer.id = 'meet-translate-panel';
        panelContainer.style.cssText = `
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
        `;

        const header = document.createElement('div');
        header.id = 'meet-translate-header';
        header.style.cssText = `
            padding: 10px 14px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-shrink: 0;
            cursor: grab;
            user-select: none;
        `;
        header.addEventListener('mousedown', startDrag);

        const titleContainer = document.createElement('div');
        titleContainer.style.cssText = `display: flex; align-items: center; gap: 8px;`;

        const title = document.createElement('span');
        title.id = 'meet-translate-title';
        title.style.cssText = `font-weight: 600; font-size: 13px; color: #fff;`;
        title.textContent = t('panel.title');

        const status = document.createElement('span');
        status.id = 'meet-translate-status';
        status.style.cssText = `font-size: 11px; color: #8ab4f8;`;
        status.textContent = t('panel.status_waiting');

        titleContainer.appendChild(title);
        titleContainer.appendChild(status);

        const actions = document.createElement('div');
        actions.style.cssText = `display: flex; gap: 6px;`;

        const copyAllBtn = document.createElement('button');
        copyAllBtn.id = 'meet-translate-copy-all';
        copyAllBtn.style.cssText = `
            background: none; border: none; color: #9aa0a6; cursor: pointer;
            padding: 4px; border-radius: 4px; display: flex; align-items: center;
            justify-content: center; transition: color 0.15s, background 0.15s;
        `;
        copyAllBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        copyAllBtn.title = t('panel.copy_all_title');
        copyAllBtn.addEventListener('mouseenter', () => { copyAllBtn.style.color = '#fff'; copyAllBtn.style.background = 'rgba(255,255,255,0.1)'; });
        copyAllBtn.addEventListener('mouseleave', () => { copyAllBtn.style.color = '#9aa0a6'; copyAllBtn.style.background = 'none'; });
        copyAllBtn.addEventListener('click', copyAllTranslations);

        const minimizeBtn = document.createElement('button');
        minimizeBtn.id = 'meet-translate-minimize';
        minimizeBtn.style.cssText = `
            background: none; border: none; color: #9aa0a6; cursor: pointer;
            padding: 4px; border-radius: 4px; display: flex; align-items: center;
            justify-content: center; transition: color 0.15s, background 0.15s;
        `;
        minimizeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
        minimizeBtn.addEventListener('mouseenter', () => { minimizeBtn.style.color = '#fff'; minimizeBtn.style.background = 'rgba(255,255,255,0.1)'; });
        minimizeBtn.addEventListener('mouseleave', () => { minimizeBtn.style.color = '#9aa0a6'; minimizeBtn.style.background = 'none'; });
        minimizeBtn.addEventListener('click', toggleMinimize);

        actions.appendChild(copyAllBtn);
        actions.appendChild(minimizeBtn);
        header.appendChild(titleContainer);
        header.appendChild(actions);

        const content = document.createElement('div');
        content.id = 'meet-translate-content';
        content.style.cssText = `
            flex: 1; overflow-y: auto; padding: 10px 14px;
            display: flex; flex-direction: column; gap: 8px; min-height: 200px;
        `;

        const emptyState = document.createElement('div');
        emptyState.id = 'meet-translate-empty';
        emptyState.style.cssText = `text-align: center; color: #9aa0a6; font-size: 12px; padding: 40px 0;`;
        emptyState.textContent = t('panel.empty_state');

        content.appendChild(emptyState);
        panelContainer.appendChild(header);
        panelContainer.appendChild(content);

        document.body.appendChild(panelContainer);
        console.log('[Meet Translate] Panel created');
    }

    function startDrag(e) {
        if (e.target.closest('button')) return;
        isDragging = true;
        dragOffsetX = e.clientX - panelContainer.offsetLeft;
        dragOffsetY = e.clientY - panelContainer.offsetTop;
        panelContainer.style.transition = 'none';
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
    }

    function onDrag(e) {
        if (!isDragging) return;
        const panelWidth = panelContainer.offsetWidth;
        const panelHeight = panelContainer.offsetHeight;
        const newX = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - panelWidth));
        const newY = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - panelHeight));
        panelContainer.style.left = newX + 'px';
        panelContainer.style.top = newY + 'px';
        panelContainer.style.right = 'auto';
        panelContainer.style.bottom = 'auto';
    }

    function stopDrag() {
        isDragging = false;
        panelContainer.style.transition = '';
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
    }

    function toggleMinimize() {
        isMinimized = !isMinimized;
        const content = document.getElementById('meet-translate-content');
        const btn = document.getElementById('meet-translate-minimize');

        if (isMinimized) {
            const currentRect = panelContainer.getBoundingClientRect();
            panelContainer.style.bottom = 'auto';
            panelContainer.style.right = 'auto';
            panelContainer.style.top = currentRect.top + 'px';
            panelContainer.style.left = currentRect.left + 'px';
            panelContainer.style.maxHeight = '44px';
            panelContainer.style.transition = 'max-height 0.25s ease, opacity 0.25s ease';
            if (content) {
                content.style.display = 'none';
            }
            if (btn) btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
            updateStatus(t('panel.status_minimized'));
        } else {
            panelContainer.style.transition = 'max-height 0.25s ease, opacity 0.25s ease';
            panelContainer.style.maxHeight = '450px';
            if (content) {
                content.style.display = 'flex';
            }
            if (btn) btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
            updateStatus(t('panel.status_waiting'));
        }
    }

    function updateStatus(text) {
        const statusEl = document.getElementById('meet-translate-status');
        if (statusEl) statusEl.textContent = text;
    }

    function addTranslationToPanel(originalText, translatedText) {
        const emptyEl = document.getElementById('meet-translate-empty');
        if (emptyEl) emptyEl.remove();

        const content = document.getElementById('meet-translate-content');
        if (!content) return;

        const itemIndex = translationItems.length;
        translationItems.push({ original: originalText, translated: translatedText });

        const item = document.createElement('div');
        item.className = 'translation-item';
        item.setAttribute('data-index', itemIndex);
        item.style.cssText = `
            padding: 8px 10px; background: rgba(255, 255, 255, 0.05);
            border-radius: 8px; border-left: 3px solid #8ab4f8;
            position: relative; cursor: pointer;
        `;

        const original = document.createElement('div');
        original.style.cssText = `font-size: 11px; color: #9aa0a6; margin-bottom: 4px; line-height: 1.4;`;
        original.textContent = originalText;

        const translated = document.createElement('div');
        translated.style.cssText = `font-size: 13px; color: #e8eaed; line-height: 1.4; padding-right: 28px;`;
        translated.textContent = translatedText;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-single-btn';
        copyBtn.style.cssText = `
            position: absolute; top: 6px; right: 6px; background: rgba(255,255,255,0.1);
            border: none; color: #9aa0a6; cursor: pointer; padding: 4px;
            border-radius: 4px; display: flex; align-items: center;
            justify-content: center; opacity: 0; transition: all 0.15s;
        `;
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        copyBtn.title = t('panel.copy_single_title');

        const copyIcon = copyBtn.querySelector('svg');
        const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(translatedText).then(() => {
                copyBtn.innerHTML = checkIcon;
                copyBtn.style.color = '#4ade80';
                setTimeout(() => {
                    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                    copyBtn.style.color = '#9aa0a6';
                }, 1500);
            }).catch((err) => {
                console.error('[Meet Translate] Copy failed:', err);
            });
        });

        item.addEventListener('mouseenter', () => { copyBtn.style.opacity = '1'; });
        item.addEventListener('mouseleave', () => { copyBtn.style.opacity = '0'; });

        item.appendChild(original);
        item.appendChild(translated);
        item.appendChild(copyBtn);
        content.appendChild(item);

        content.scrollTop = content.scrollHeight;

        const maxItems = 50;
        while (content.querySelectorAll('.translation-item').length > maxItems) {
            const firstItem = content.querySelector('.translation-item');
            if (firstItem) content.removeChild(firstItem);
        }
    }

    function addPendingItemToPanel(originalText) {
        const emptyEl = document.getElementById('meet-translate-empty');
        if (emptyEl) emptyEl.remove();

        const content = document.getElementById('meet-translate-content');
        if (!content) return;

        const itemIndex = translationItems.length;
        translationItems.push({ original: originalText, translated: null, pending: true });
        pendingItemIndex = itemIndex;

        const item = document.createElement('div');
        item.className = 'translation-item';
        item.setAttribute('data-index', itemIndex);
        item.style.cssText = `
            padding: 8px 10px; background: rgba(255, 255, 255, 0.03);
            border-radius: 8px; border-left: 3px solid #fbbf24;
            position: relative; opacity: 0.7;
        `;

        const original = document.createElement('div');
        original.className = 'pending-original';
        original.style.cssText = `font-size: 11px; color: #9aa0a6; margin-bottom: 4px; line-height: 1.4;`;
        original.textContent = originalText;

        const statusText = document.createElement('div');
        statusText.className = 'pending-status';
        statusText.style.cssText = `font-size: 12px; color: #fbbf24; line-height: 1.4; font-style: italic;`;
        statusText.textContent = t('panel.status_collecting');

        const dots = document.createElement('span');
        dots.className = 'pending-dots';
        dots.style.cssText = `color: #fbbf24;`;
        dots.textContent = '';

        statusText.appendChild(dots);
        item.appendChild(original);
        item.appendChild(statusText);
        content.appendChild(item);

        content.scrollTop = content.scrollHeight;

        let dotCount = 0;
        const dotInterval = setInterval(() => {
            dotCount = (dotCount + 1) % 4;
            if (dots.parentNode) {
                dots.textContent = '.'.repeat(dotCount);
            } else {
                clearInterval(dotInterval);
            }
        }, 500);
    }

    function updatePendingItemStatus(status) {
        if (pendingItemIndex === null) return;
        const item = document.querySelector(`.translation-item[data-index="${pendingItemIndex}"]`);
        if (!item) return;
        const statusEl = item.querySelector('.pending-status');
        if (statusEl) {
            const dots = statusEl.querySelector('.pending-dots');
            statusEl.textContent = status;
            if (dots) {
                statusEl.appendChild(dots);
            }
        }
    }

    function finalizePendingItem(translatedText) {
        if (pendingItemIndex === null) return;
        const itemIndex = pendingItemIndex;
        pendingItemIndex = null;

        const item = document.querySelector(`.translation-item[data-index="${itemIndex}"]`);
        if (!item) return;

        if (translationItems[itemIndex]) {
            translationItems[itemIndex].translated = translatedText;
            translationItems[itemIndex].pending = false;
        }

        const statusEl = item.querySelector('.pending-status');
        if (statusEl) {
            const dots = statusEl.querySelector('.pending-dots');
            if (dots) dots.remove();
            statusEl.style.transition = 'color 0.3s ease, font-style 0.3s ease';
            statusEl.style.color = '#e8eaed';
            statusEl.style.fontStyle = 'normal';
            statusEl.style.fontSize = '13px';
            statusEl.style.paddingRight = '28px';
            statusEl.textContent = translatedText;
        }

        const originalEl = item.querySelector('.pending-original');
        if (originalEl) {
            originalEl.className = '';
            originalEl.style.cssText = `font-size: 11px; color: #9aa0a6; margin-bottom: 4px; line-height: 1.4;`;
        }

        item.style.transition = 'border-color 0.3s ease, background 0.3s ease, opacity 0.3s ease';
        item.style.cssText = `
            padding: 8px 10px; background: rgba(255, 255, 255, 0.05);
            border-radius: 8px; border-left: 3px solid #8ab4f8;
            position: relative; cursor: pointer; opacity: 1;
        `;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-single-btn';
        copyBtn.style.cssText = `
            position: absolute; top: 6px; right: 6px; background: rgba(255,255,255,0.1);
            border: none; color: #9aa0a6; cursor: pointer; padding: 4px;
            border-radius: 4px; display: flex; align-items: center;
            justify-content: center; opacity: 0; transition: all 0.15s;
        `;
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        copyBtn.title = t('panel.copy_single_title');

        const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(translatedText).then(() => {
                copyBtn.innerHTML = checkIcon;
                copyBtn.style.color = '#4ade80';
                setTimeout(() => {
                    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                    copyBtn.style.color = '#9aa0a6';
                }, 1500);
            }).catch((err) => {
                console.error('[Meet Translate] Copy failed:', err);
            });
        });

        item.addEventListener('mouseenter', () => { copyBtn.style.opacity = '1'; });
        item.addEventListener('mouseleave', () => { copyBtn.style.opacity = '0'; });

        item.appendChild(copyBtn);
    }

    async function copyAllTranslations() {
        if (translationItems.length === 0) return;

        const allText = translationItems.map((item) => item.translated).join('\n\n');

        try {
            await navigator.clipboard.writeText(allText);
            updateStatus(t('panel.copy_all_success'));
            setTimeout(() => updateStatus(t('panel.status_waiting')), 2000);
        } catch (e) {
            console.error('[Meet Translate] Copy all failed:', e);
        }
    }

    function getBlockKey(textEl) {
        const block = textEl.closest(CAPTION_SELECTORS.BLOCK);
        if (!block) return `unknown::${textEl.textContent.substring(0, 20)}`;

        const speakerEl = block.querySelector(CAPTION_SELECTORS.SPEAKER);
        const speakerName = speakerEl ? speakerEl.textContent.trim() : 'unknown';
        const allBlocks = captionContainer ? Array.from(captionContainer.querySelectorAll(CAPTION_SELECTORS.BLOCK)) : [];
        const index = allBlocks.indexOf(block);
        return `speaker:${speakerName}::index:${index}`;
    }

    function getOrCreateBlockState(blockKey) {
        if (!blockState.has(blockKey)) {
            blockState.set(blockKey, {
                stableText: '',
                pendingText: '',
                lastChangeTime: 0,
            });
        }
        return blockState.get(blockKey);
    }

    function extractNewSentences(stableText, previousStableText) {
        if (!stableText) return [];
        if (stableText === previousStableText) return [];

        const allSentences = splitIntoSentences(stableText);
        const prevSentences = splitIntoSentences(previousStableText);

        const newSentences = [];
        let prevIndex = 0;

        for (const sentence of allSentences) {
            let found = false;
            for (let j = prevIndex; j < prevSentences.length; j++) {
                if (sentence === prevSentences[j]) {
                    prevIndex = j + 1;
                    found = true;
                    break;
                }
            }
            if (!found) {
                newSentences.push(sentence);
            }
        }

        return newSentences;
    }

    function normalizeForDedup(text) {
        return text.trim()
            .replace(/[。！？.!?]+$/g, '')
            .replace(/[、，,]+/g, '、')
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    async function deduplicateBeforeSend(sentences) {
        if (sentences.length === 0) return [];

        const seen = new Set();
        const result = [];

        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (!trimmed) continue;

            const normalized = normalizeForDedup(trimmed);
            if (!normalized) continue;

            if (seen.has(normalized)) {
                console.log(`[Meet Translate] Dedup (within buffer): "${trimmed.substring(0, 40)}"`);
                continue;
            }

            const isProcessed = await isSentenceProcessed(normalized);
            if (isProcessed) {
                console.log(`[Meet Translate] Dedup (IndexedDB): "${trimmed.substring(0, 40)}"`);
                continue;
            }

            seen.add(normalized);
            result.push({ original: trimmed, normalized });
        }

        return result;
    }

    async function checkBlockStability(textEl, blockKey, state) {
        const currentText = textEl.textContent.trim();
        if (!currentText) return [];

        if (currentText === state.pendingText) {
            const timeSinceChange = Date.now() - state.lastChangeTime;
            if (timeSinceChange >= STABLE_DEBOUNCE_MS && currentText !== state.stableText) {
                const cooldownEnd = Date.now() + POST_EXTRACT_COOLDOWN_MS;
                console.log(`[Meet Translate] Block ${blockKey} STABLE: "${currentText.substring(0, 80)}"`);
                const newSentences = extractNewSentences(currentText, state.stableText);
                state.stableText = currentText;
                state.pendingText = '';
                state.cooldownUntil = cooldownEnd;
                console.log(`[Meet Translate] New sentences:`, newSentences);
                return newSentences;
            }
            return [];
        }

        if (state.cooldownUntil && Date.now() < state.cooldownUntil) {
            return [];
        }

        state.pendingText = currentText;
        state.lastChangeTime = Date.now();
        return [];
    }

    async function flushBuffer() {
        if (sentenceBuffer.length === 0 || isTranslating) return;

        isTranslating = true;
        pendingItemIndex = 'flushing';

        const deduplicated = await deduplicateBeforeSend(sentenceBuffer);
        sentenceBuffer = [];
        clearSilenceTimer();

        if (deduplicated.length === 0) {
            isTranslating = false;
            pendingItemIndex = null;
            updateStatus(t('panel.status_deduped'));
            return;
        }

        const textToTranslate = deduplicated.map((s) => s.original).join(' ');
        const sentenceCount = deduplicated.length;

        addPendingItemToPanel(textToTranslate);

        updateStatus(t('panel.status_translating'));
        updatePendingItemStatus(t('panel.status_translating'));

        console.log(`[Meet Translate] Sending batch (${sentenceCount} sentences):`, textToTranslate.substring(0, 150));

        chrome.runtime.sendMessage({
            type: 'TRANSLATE',
            text: textToTranslate,
            sourceLang: sourceLanguage,
            targetLang: targetLanguage,
            apiKey: apiKey,
        }, (response) => {
            isTranslating = false;

            if (chrome.runtime.lastError) {
                console.error('[Meet Translate] Message error:', chrome.runtime.lastError.message);
                updateStatus(t('panel.status_error_connection'));
                updatePendingItemStatus(t('panel.status_error_connection'));
                return;
            }

            if (response && response.success && response.translatedText) {
                finalizePendingItem(response.translatedText);
                updateStatus(t('panel.status_translated_count', { count: sentenceCount }));

                deduplicated.forEach((s) => markSentenceProcessed(s.normalized));
            } else {
                console.warn('[Meet Translate] Translation failed:', response?.error);
                updateStatus(t('panel.status_error_translation'));
                updatePendingItemStatus(t('panel.status_error_translation'));
            }
        });
    }

    function clearSilenceTimer() {
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    }

    function resetSilenceTimer() {
        clearSilenceTimer();
        lastCaptionTime = Date.now();
        silenceTimer = setTimeout(() => {
            console.log('[Meet Translate] Silence timeout, flushing buffer');
            flushBuffer();
        }, SILENCE_TIMEOUT_MS);
    }

    function getSpeakerName(textEl) {
        const block = textEl.closest(CAPTION_SELECTORS.BLOCK);
        if (!block) return 'unknown';
        const speakerEl = block.querySelector(CAPTION_SELECTORS.SPEAKER);
        return speakerEl ? speakerEl.textContent.trim() : 'unknown';
    }

    async function pollCaptions() {
        if (!isActive || !captionContainer) return;

        const textEls = captionContainer.querySelectorAll(CAPTION_SELECTORS.TEXT);
        if (textEls.length === 0) return;

        for (const textEl of textEls) {
            const blockKey = getBlockKey(textEl);
            const state = getOrCreateBlockState(blockKey);
            const newSentences = await checkBlockStability(textEl, blockKey, state);

            if (newSentences.length > 0) {
                const currentSpeaker = getSpeakerName(textEl);

                if (activeSpeaker && currentSpeaker !== activeSpeaker) {
                    console.log(`[Meet Translate] Speaker changed: "${activeSpeaker}" -> "${currentSpeaker}", flushing previous speaker's buffer`);
                    flushBuffer();
                }

                activeSpeaker = currentSpeaker;
                sentenceBuffer.push(...newSentences);
                console.log(`[Meet Translate] Buffer (${currentSpeaker}): ${sentenceBuffer.length} sentences`);
                resetSilenceTimer();

                if (pendingItemIndex !== null && pendingItemIndex !== 'flushing') {
                    const item = document.querySelector(`.translation-item[data-index="${pendingItemIndex}"]`);
                    if (item) {
                        const originalEl = item.querySelector('.pending-original');
                        if (originalEl) {
                            originalEl.textContent = sentenceBuffer.join(' ');
                        }
                    }
                }
            }
        }

        if (sentenceBuffer.length > 0 && !silenceTimer) {
            resetSilenceTimer();
        }
    }

    function startPolling() {
        stopPolling();
        createPanel();
        pollingTimer = setInterval(pollCaptions, POLL_INTERVAL_MS);
        console.log('[Meet Translate] Polling started, interval:', POLL_INTERVAL_MS, 'ms');
        console.log('[Meet Translate] Stable debounce:', STABLE_DEBOUNCE_MS, 'ms');
    }

    function stopPolling() {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }
        clearSilenceTimer();
    }

    function initCaptionDetection() {
        console.log('[Meet Translate] initCaptionDetection called');
        const found = detectCaptionContainer();
        console.log('[Meet Translate] detectCaptionContainer returned:', found);
        if (found) {
            console.log('[Meet Translate] Container found, starting polling');
            startPolling();
        } else {
            console.log('[Meet Translate] Container not found, will retry');
        }
    }

    function waitForDOMReady() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initCaptionDetection, 2000);
            });
        } else {
            setTimeout(initCaptionDetection, 2000);
        }
    }

    function loadSettings() {
        chrome.storage.sync.get(
            [
                STORAGE_KEYS.SOURCE_LANGUAGE,
                STORAGE_KEYS.TARGET_LANGUAGE,
                STORAGE_KEYS.IS_ACTIVE,
                STORAGE_KEYS.API_KEY,
                STORAGE_KEYS.EXTENSION_LANGUAGE,
            ],
            (items) => {
                sourceLanguage = items[STORAGE_KEYS.SOURCE_LANGUAGE] || DEFAULT_SOURCE_LANGUAGE;
                targetLanguage = items[STORAGE_KEYS.TARGET_LANGUAGE] || DEFAULT_LANGUAGE;
                isActive = items[STORAGE_KEYS.IS_ACTIVE] !== false;
                apiKey = items[STORAGE_KEYS.API_KEY] || '';
                const extLang = items[STORAGE_KEYS.EXTENSION_LANGUAGE] || DEFAULT_LANGUAGE;

                console.log('[Meet Translate] Settings loaded:', {
                    sourceLanguage,
                    targetLanguage,
                    isActive,
                    hasApiKey: !!apiKey,
                });

                loadPanelTranslations(extLang);
                waitForDOMReady();
            }
        );
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;

        if (changes[STORAGE_KEYS.SOURCE_LANGUAGE]) {
            sourceLanguage = changes[STORAGE_KEYS.SOURCE_LANGUAGE].newValue;
        }
        if (changes[STORAGE_KEYS.TARGET_LANGUAGE]) {
            targetLanguage = changes[STORAGE_KEYS.TARGET_LANGUAGE].newValue;
        }
        if (changes[STORAGE_KEYS.IS_ACTIVE]) {
            isActive = changes[STORAGE_KEYS.IS_ACTIVE].newValue;
            if (!isActive) {
                updateStatus(t('panel.status_off'));
            }
        }
        if (changes[STORAGE_KEYS.API_KEY]) {
            apiKey = changes[STORAGE_KEYS.API_KEY].newValue;
        }
        if (changes[STORAGE_KEYS.EXTENSION_LANGUAGE]) {
            loadPanelTranslations(changes[STORAGE_KEYS.EXTENSION_LANGUAGE].newValue);
        }
    });

    console.log('[Meet Translate] Initializing...');
    initSentenceHistory().then(() => {
        loadSettings();
    });
})();
