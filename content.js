(function () {
    'use strict';

    let captionContainer = null;
    let observer = null;
    let isActive = true;
    let sourceLanguage = DEFAULT_SOURCE_LANGUAGE;
    let targetLanguage = DEFAULT_LANGUAGE;
    let apiKey = '';
    let retryTimer = null;
    const RETRY_INTERVAL_MS = 3000;
    const TRANSLATE_INTERVAL_MS = 2000;
    const blockState = new Map();
    let isUpdatingDOM = false;
    let throttleTimers = new Map();

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
            retryTimer = setTimeout(detectCaptionContainer, RETRY_INTERVAL_MS);
            return false;
        }

        console.log('[Meet Translate] Found caption container');
        clearRetryTimer();
        return true;
    }

    function getBlockKey(block) {
        const speakerEl = block.querySelector(CAPTION_SELECTORS.SPEAKER);
        const speakerName = speakerEl ? speakerEl.textContent.trim() : 'unknown';
        const allBlocks = captionContainer ? Array.from(captionContainer.querySelectorAll(CAPTION_SELECTORS.BLOCK)) : [];
        const index = allBlocks.indexOf(block);
        return `speaker:${speakerName}::index:${index}`;
    }

    function getOrCreateBlockState(blockKey) {
        if (!blockState.has(blockKey)) {
            blockState.set(blockKey, {
                lastSentText: '',
                lastTranslatedText: '',
                isTranslating: false,
                newTextBuffer: '',
                lastCheckTime: 0,
            });
        }
        return blockState.get(blockKey);
    }

    function scheduleThrottledTranslation(block, blockKey, state) {
        const now = Date.now();
        const timeSinceLastCheck = now - state.lastCheckTime;

        if (timeSinceLastCheck >= TRANSLATE_INTERVAL_MS) {
            state.lastCheckTime = now;
            processCaptionBlock(block, blockKey, state);
        } else {
            if (throttleTimers.has(blockKey)) {
                clearTimeout(throttleTimers.get(blockKey));
            }
            throttleTimers.set(blockKey, setTimeout(() => {
                throttleTimers.delete(blockKey);
                state.lastCheckTime = Date.now();
                processCaptionBlock(block, blockKey, state);
            }, TRANSLATE_INTERVAL_MS - timeSinceLastCheck));
        }
    }

    function processCaptionBlock(block, blockKey, state) {
        if (!isActive || !apiKey || isUpdatingDOM) return;

        const textEl = block.querySelector(CAPTION_SELECTORS.TEXT);
        if (!textEl) return;

        const currentFullText = textEl.textContent.trim();
        if (!currentFullText) return;

        if (state.isTranslating) return;

        if (currentFullText === state.lastSentText) return;

        let textToTranslate;
        if (!state.lastSentText) {
            textToTranslate = currentFullText;
        } else if (currentFullText.startsWith(state.lastSentText)) {
            textToTranslate = currentFullText.slice(state.lastSentText.length).trim();
        } else {
            const commonLen = getCommonPrefixLength(state.lastSentText, currentFullText);
            textToTranslate = currentFullText.slice(commonLen).trim();
        }

        if (!textToTranslate) {
            state.lastSentText = currentFullText;
            return;
        }

        state.isTranslating = true;
        state.lastSentText = currentFullText;

        console.log('[Meet Translate] Sending for translation:', textToTranslate.substring(0, 60));

        chrome.runtime.sendMessage({
            type: 'TRANSLATE',
            text: textToTranslate,
            sourceLang: sourceLanguage,
            targetLang: targetLanguage,
            apiKey: apiKey,
        }, (response) => {
            state.isTranslating = false;

            if (chrome.runtime.lastError) {
                console.error('[Meet Translate] Message error:', chrome.runtime.lastError.message);
                return;
            }

            if (response && response.success && response.translatedText) {
                state.lastTranslatedText = state.lastTranslatedText
                    ? state.lastTranslatedText + ' ' + response.translatedText
                    : response.translatedText;

                isUpdatingDOM = true;
                if (observer) observer.disconnect();

                const textElFinal = block.querySelector(CAPTION_SELECTORS.TEXT);
                if (textElFinal) {
                    textElFinal.textContent = state.lastTranslatedText;
                }

                setTimeout(() => {
                    isUpdatingDOM = false;
                    if (captionContainer && observer) {
                        observer.observe(captionContainer, {
                            childList: true,
                            subtree: true,
                            characterData: true,
                        });
                    }
                }, 300);

                console.log('[Meet Translate] Translated:', textToTranslate.substring(0, 50), '->', response.translatedText.substring(0, 50));
            } else if (response && !response.success) {
                console.warn('[Meet Translate] Translation failed:', response.error);
            }
        });
    }

    function getCommonPrefixLength(a, b) {
        let i = 0;
        const minLen = Math.min(a.length, b.length);
        while (i < minLen && a[i] === b[i]) {
            i++;
        }
        return i;
    }

    function onMutation() {
        if (!isActive || !captionContainer || isUpdatingDOM) return;

        const blocks = captionContainer.querySelectorAll(CAPTION_SELECTORS.BLOCK);
        blocks.forEach((block) => {
            const blockKey = getBlockKey(block);
            const state = getOrCreateBlockState(blockKey);
            scheduleThrottledTranslation(block, blockKey, state);
        });
    }

    function setupObserver() {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver(onMutation);

        observer.observe(captionContainer, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        console.log('[Meet Translate] Observer setup on caption container');
    }

    function initCaptionDetection() {
        if (detectCaptionContainer()) {
            setupObserver();
        }
    }

    function waitForDOMReady() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initCaptionDetection, 1000);
            });
        } else {
            setTimeout(initCaptionDetection, 1000);
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
        }
        if (changes[STORAGE_KEYS.API_KEY]) {
            apiKey = changes[STORAGE_KEYS.API_KEY].newValue;
        }
    });

    loadSettings();
})();
