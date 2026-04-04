(function () {
    'use strict';

    let currentExtLang = DEFAULT_LANGUAGE;
    let translations = {};

    const elements = {
        apiKey: document.getElementById('apiKey'),
        sourceLang: document.getElementById('sourceLang'),
        targetLang: document.getElementById('targetLang'),
        extLang: document.getElementById('extLang'),
        isActive: document.getElementById('isActive'),
        statusText: document.getElementById('statusText'),
        saveBtn: document.getElementById('saveBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        message: document.getElementById('message'),
    };

    function loadTranslations(lang) {
        fetch(chrome.runtime.getURL(`lang/${lang}.json`))
            .then((res) => res.json())
            .then((data) => {
                translations = data;
                applyTranslations();
            })
            .catch((err) => {
                console.error('[Meet Translate] Failed to load translations:', err);
            });
    }

    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const keys = key.split('.');
            let value = translations;
            for (const k of keys) {
                value = value?.[k];
            }
            if (value) {
                el.textContent = value;
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            const keys = key.split('.');
            let value = translations;
            for (const k of keys) {
                value = value?.[k];
            }
            if (value) {
                el.placeholder = value;
            }
        });

        updateStatusText();
    }

    function updateStatusText() {
        const statusKey = elements.isActive.checked ? 'ui.on' : 'ui.off';
        const keys = statusKey.split('.');
        let value = translations;
        for (const k of keys) {
            value = value?.[k];
        }
        if (value) {
            elements.statusText.textContent = value;
        }
    }

    function populateLanguageSelects() {
        Object.entries(LANGUAGES).forEach(([code, name]) => {
            const optionSource = document.createElement('option');
            optionSource.value = code;
            optionSource.textContent = name;
            elements.sourceLang.appendChild(optionSource);

            const optionTarget = document.createElement('option');
            optionTarget.value = code;
            optionTarget.textContent = name;
            elements.targetLang.appendChild(optionTarget);
        });

        Object.entries(EXTENSION_LANGUAGES).forEach(([code, name]) => {
            const optionExt = document.createElement('option');
            optionExt.value = code;
            optionExt.textContent = name;
            elements.extLang.appendChild(optionExt);
        });
    }

    function loadSettings() {
        chrome.storage.sync.get(
            [
                STORAGE_KEYS.API_KEY,
                STORAGE_KEYS.SOURCE_LANGUAGE,
                STORAGE_KEYS.TARGET_LANGUAGE,
                STORAGE_KEYS.EXTENSION_LANGUAGE,
                STORAGE_KEYS.IS_ACTIVE,
            ],
            (items) => {
                elements.apiKey.value = items[STORAGE_KEYS.API_KEY] || '';
                elements.sourceLang.value = items[STORAGE_KEYS.SOURCE_LANGUAGE] || DEFAULT_SOURCE_LANGUAGE;
                elements.targetLang.value = items[STORAGE_KEYS.TARGET_LANGUAGE] || DEFAULT_LANGUAGE;

                currentExtLang = items[STORAGE_KEYS.EXTENSION_LANGUAGE] || DEFAULT_LANGUAGE;
                elements.extLang.value = currentExtLang;

                elements.isActive.checked = items[STORAGE_KEYS.IS_ACTIVE] !== false;

                updateStatusText();
                loadTranslations(currentExtLang);
            }
        );
    }

    function saveSettings() {
        const apiKey = elements.apiKey.value.trim();

        if (!apiKey) {
            showMessage('error', translations.ui?.error_api_key || 'API Key is required');
            return;
        }

        const settings = {
            [STORAGE_KEYS.API_KEY]: apiKey,
            [STORAGE_KEYS.SOURCE_LANGUAGE]: elements.sourceLang.value,
            [STORAGE_KEYS.TARGET_LANGUAGE]: elements.targetLang.value,
            [STORAGE_KEYS.EXTENSION_LANGUAGE]: elements.extLang.value,
            [STORAGE_KEYS.IS_ACTIVE]: elements.isActive.checked,
        };

        chrome.storage.sync.set(settings, () => {
            if (chrome.runtime.lastError) {
                showMessage('error', translations.ui?.error_save || 'Failed to save settings');
                return;
            }

            showMessage('success', translations.ui?.save_success || 'Settings saved successfully');
            setTimeout(() => {
                window.close();
            }, 1000);
        });
    }

    function showMessage(type, text) {
        elements.message.textContent = text;
        elements.message.className = `message ${type}`;

        if (type === 'success') {
            setTimeout(() => {
                elements.message.className = 'message hidden';
            }, 3000);
        }
    }

    elements.isActive.addEventListener('change', () => {
        updateStatusText();
    });

    elements.extLang.addEventListener('change', () => {
        currentExtLang = elements.extLang.value;
        loadTranslations(currentExtLang);
    });

    elements.saveBtn.addEventListener('click', saveSettings);

    elements.cancelBtn.addEventListener('click', () => {
        window.close();
    });

    populateLanguageSelects();
    loadSettings();
})();
