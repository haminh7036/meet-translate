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
    const POLL_INTERVAL_MS = 1000;
    const blockState = new Map();
    let overlayContainer = null;
    let pollingTimer = null;

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

    function createOverlay() {
        if (overlayContainer) {
            overlayContainer.remove();
        }

        overlayContainer = document.createElement('div');
        overlayContainer.id = 'meet-translate-overlay';
        overlayContainer.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            max-width: 600px;
            width: 90%;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 12px 16px;
            border-radius: 12px;
            font-family: 'Google Sans', Roboto, Arial, sans-serif;
            font-size: 16px;
            line-height: 1.5;
            text-align: center;
            z-index: 999999;
            pointer-events: none;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            display: none;
            transition: opacity 0.2s ease;
            word-break: break-word;
        `;

        document.body.appendChild(overlayContainer);
        console.log('[Meet Translate] Overlay created');
    }

    function showOverlay(text) {
        if (!overlayContainer) return;
        overlayContainer.textContent = text;
        overlayContainer.style.display = 'block';
    }

    function hideOverlay() {
        if (!overlayContainer) return;
        overlayContainer.style.display = 'none';
    }

    function hideOriginalCaptions() {
        if (!captionContainer) return;
        const textEls = captionContainer.querySelectorAll(CAPTION_SELECTORS.TEXT);
        textEls.forEach((el) => {
            el.style.opacity = '0';
        });
    }

    function showOriginalCaptions() {
        if (!captionContainer) return;
        const textEls = captionContainer.querySelectorAll(CAPTION_SELECTORS.TEXT);
        textEls.forEach((el) => {
            el.style.opacity = '';
        });
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
                lastSentLength: 0,
                fullTranslatedText: '',
                isTranslating: false,
                lastCheckTime: 0,
            });
        }
        return blockState.get(blockKey);
    }

    function processTextElement(textEl, blockKey, state) {
        if (!isActive) return;
        if (!apiKey) return;
        if (state.isTranslating) return;

        const currentFullText = textEl.textContent.trim();
        if (!currentFullText) return;

        const currentLength = currentFullText.length;

        if (currentLength <= state.lastSentLength) return;

        const now = Date.now();
        const timeSinceLastCheck = now - state.lastCheckTime;
        if (timeSinceLastCheck < POLL_INTERVAL_MS) {
            return;
        }

        const newText = currentFullText.slice(state.lastSentLength).trim();
        if (!newText) {
            state.lastSentLength = currentLength;
            return;
        }

        state.lastCheckTime = now;
        state.isTranslating = true;

        console.log('[Meet Translate] Sending delta for translation:', newText.substring(0, 80));

        chrome.runtime.sendMessage({
            type: 'TRANSLATE',
            text: newText,
            sourceLang: sourceLanguage,
            targetLang: targetLanguage,
            apiKey: apiKey,
        }, (response) => {
            state.isTranslating = false;

            if (chrome.runtime.lastError) {
                console.error('[Meet Translate] Message error:', chrome.runtime.lastError.message);
                state.lastSentLength = currentLength;
                return;
            }

            if (response && response.success && response.translatedText) {
                state.lastSentLength = currentLength;
                state.fullTranslatedText = state.fullTranslatedText
                    ? state.fullTranslatedText + ' ' + response.translatedText
                    : response.translatedText;

                showOverlay(state.fullTranslatedText);

                console.log('[Meet Translate] Translated delta:', newText.substring(0, 50), '->', response.translatedText.substring(0, 50));
            } else if (response && !response.success) {
                console.warn('[Meet Translate] Translation failed:', response.error);
                state.lastSentLength = currentLength;
            }
        });
    }

    function pollCaptions() {
        if (!isActive || !captionContainer) return;

        const textEls = captionContainer.querySelectorAll(CAPTION_SELECTORS.TEXT);
        if (textEls.length === 0) {
            hideOverlay();
            return;
        }

        hideOriginalCaptions();

        let hasActiveCaption = false;

        textEls.forEach((textEl) => {
            const blockKey = getBlockKey(textEl);
            const state = getOrCreateBlockState(blockKey);
            processTextElement(textEl, blockKey, state);

            if (textEl.textContent.trim() && state.lastTranslatedText) {
                hasActiveCaption = true;
            }
        });

        if (!hasActiveCaption) {
            hideOverlay();
        }
    }

    function startPolling() {
        stopPolling();
        createOverlay();
        pollingTimer = setInterval(pollCaptions, POLL_INTERVAL_MS);
        console.log('[Meet Translate] Polling started, interval:', POLL_INTERVAL_MS, 'ms');
    }

    function stopPolling() {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }
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
            ],
            (items) => {
                sourceLanguage = items[STORAGE_KEYS.SOURCE_LANGUAGE] || DEFAULT_SOURCE_LANGUAGE;
                targetLanguage = items[STORAGE_KEYS.TARGET_LANGUAGE] || DEFAULT_LANGUAGE;
                isActive = items[STORAGE_KEYS.IS_ACTIVE] !== false;
                apiKey = items[STORAGE_KEYS.API_KEY] || '';

                console.log('[Meet Translate] Settings loaded:', {
                    sourceLanguage,
                    targetLanguage,
                    isActive,
                    hasApiKey: !!apiKey,
                });

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
                hideOverlay();
                showOriginalCaptions();
            }
        }
        if (changes[STORAGE_KEYS.API_KEY]) {
            apiKey = changes[STORAGE_KEYS.API_KEY].newValue;
        }
    });

    console.log('[Meet Translate] Initializing...');
    loadSettings();
})();
