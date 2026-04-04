(function () {
    'use strict';

    let captionContainer = null;
    let observer = null;
    let isActive = true;
    let sourceLanguage = DEFAULT_SOURCE_LANGUAGE;
    let targetLanguage = DEFAULT_LANGUAGE;
    let apiKey = '';
    const debounceTimers = new Map();
    const translatedTexts = new Map();

    function getAriaLabel() {
        const htmlLang = document.documentElement.lang || 'en';
        return ARIA_LABELS[htmlLang] || ARIA_LABELS['en'];
    }

    function detectCaptionContainer() {
        const ariaLabel = getAriaLabel();
        captionContainer = document.querySelector(
            `[role="region"][aria-label*="${ariaLabel}"]`
        ) || document.querySelector(CAPTION_SELECTORS.CONTAINER);

        if (!captionContainer) {
            console.warn('[Meet Translate] Caption container not found, retrying in 5s...');
            setTimeout(detectCaptionContainer, 5000);
            return false;
        }
        return true;
    }

    function debounce(blockKey, fn, delay) {
        if (debounceTimers.has(blockKey)) {
            clearTimeout(debounceTimers.get(blockKey));
        }
        debounceTimers.set(blockKey, setTimeout(() => {
            debounceTimers.delete(blockKey);
            fn();
        }, delay));
    }

    function extractTextFromBlock(block) {
        const textEl = block.querySelector(CAPTION_SELECTORS.TEXT);
        return textEl ? textEl.textContent.trim() : null;
    }

    function getTextElement(block) {
        return block.querySelector(CAPTION_SELECTORS.TEXT);
    }

    function getBlockKey(block) {
        const speakerEl = block.querySelector(CAPTION_SELECTORS.SPEAKER);
        const speakerName = speakerEl ? speakerEl.textContent.trim() : 'unknown';
        const avatarImg = block.querySelector('img');
        const avatarSrc = avatarImg ? avatarImg.src : '';
        return `${speakerName}::${avatarSrc}`;
    }

    function processCaptionBlock(block) {
        if (!isActive || !apiKey) return;

        const text = extractTextFromBlock(block);
        if (!text || text.length === 0) return;

        const blockKey = getBlockKey(block);
        const lastTranslated = translatedTexts.get(blockKey);

        if (lastTranslated === text) return;

        debounce(blockKey, () => {
            translateCaption(text, block, blockKey);
        }, DEBOUNCE_MS);
    }

    function translateCaption(text, block, blockKey) {
        chrome.runtime.sendMessage({
            type: 'TRANSLATE',
            text: text,
            sourceLang: sourceLanguage,
            targetLang: targetLanguage,
            apiKey: apiKey,
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Meet Translate] Message error:', chrome.runtime.lastError.message);
                return;
            }

            if (response && response.success && response.translatedText) {
                const textEl = getTextElement(block);
                if (textEl) {
                    textEl.textContent = response.translatedText;
                    translatedTexts.set(blockKey, response.translatedText);
                }
            }
        });
    }

    function setupObserver() {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver((mutations) => {
            if (!isActive || !captionContainer) return;

            const blocks = captionContainer.querySelectorAll(CAPTION_SELECTORS.BLOCK);
            blocks.forEach((block) => {
                processCaptionBlock(block);
            });
        });

        observer.observe(captionContainer, {
            childList: true,
            subtree: true,
            characterData: true,
        });
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

                if (detectCaptionContainer()) {
                    setupObserver();
                }
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
