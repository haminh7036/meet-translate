// content.js — Content Script for Meet AI Translator
// Observes Google Meet captions and displays translations

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let isEnabled = true;
  let targetLanguage = 'vi';
  let observer = null;
  let translationOverlay = null;
  let lastProcessedText = '';
  let debounceTimer = null;
  const DEBOUNCE_MS = 800; // Wait for caption to stabilize

  // ── UI: Translation Overlay ────────────────────────────
  function createOverlay() {
    if (translationOverlay) return translationOverlay;

    translationOverlay = document.createElement('div');
    translationOverlay.id = 'meet-translator-overlay';
    translationOverlay.innerHTML = `
      <div class="mt-header">
        <span class="mt-title">🌐 Meet Translator</span>
        <div class="mt-controls">
          <button id="mt-toggle" class="mt-btn" title="Bật/Tắt dịch">⏸</button>
          <button id="mt-minimize" class="mt-btn" title="Thu nhỏ">─</button>
        </div>
      </div>
      <div class="mt-body">
        <div id="mt-original" class="mt-text mt-original"></div>
        <div class="mt-divider"></div>
        <div id="mt-translated" class="mt-text mt-translated"></div>
      </div>
      <div id="mt-status" class="mt-status">Đang chờ caption...</div>
    `;

    document.body.appendChild(translationOverlay);

    // Toggle button
    document.getElementById('mt-toggle').addEventListener('click', () => {
      isEnabled = !isEnabled;
      document.getElementById('mt-toggle').textContent = isEnabled ? '⏸' : '▶';
      document.getElementById('mt-status').textContent = isEnabled
        ? 'Đang chờ caption...'
        : 'Đã tạm dừng';
    });

    // Minimize button
    let isMinimized = false;
    document.getElementById('mt-minimize').addEventListener('click', () => {
      isMinimized = !isMinimized;
      translationOverlay.classList.toggle('mt-minimized', isMinimized);
      document.getElementById('mt-minimize').textContent = isMinimized ? '□' : '─';
    });

    // Make overlay draggable
    makeDraggable(translationOverlay);

    return translationOverlay;
  }

  function makeDraggable(element) {
    const header = element.querySelector('.mt-header');
    let isDragging = false;
    let startX, startY, initialX, initialY;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${initialX + dx}px`;
      element.style.top = `${initialY + dy}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      header.style.cursor = 'grab';
    });
  }

  // ── Caption Detection ──────────────────────────────────
  // Google Meet renders captions in elements with specific attributes.
  // The exact selectors may change; these cover common patterns.
  const CAPTION_SELECTORS = [
    '[jsname="tgaKEf"]',          // Common caption container
    '.iOzk7',                     // Caption text class
    '.VbkSUe',                    // Alternative caption container
    '[jscontroller="TEjod"]',     // Caption controller
    '.a4cQT',                     // Newer caption class
  ];

  function findCaptionContainer() {
    for (const selector of CAPTION_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function extractCaptionText(container) {
    if (!container) return '';
    // Get all text spans within the caption container
    const spans = container.querySelectorAll('span');
    if (spans.length > 0) {
      return Array.from(spans).map((s) => s.textContent.trim()).filter(Boolean).join(' ');
    }
    return container.textContent?.trim() || '';
  }

  // ── Translation Logic ──────────────────────────────────
  async function handleCaptionUpdate(text) {
    if (!text || text === lastProcessedText || !isEnabled) return;

    lastProcessedText = text;

    const originalEl = document.getElementById('mt-original');
    const translatedEl = document.getElementById('mt-translated');
    const statusEl = document.getElementById('mt-status');

    if (originalEl) originalEl.textContent = text;
    if (statusEl) statusEl.textContent = 'Đang dịch...';
    if (translatedEl) translatedEl.textContent = '...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text,
        targetLang: targetLanguage,
      });

      if (response?.translated) {
        if (translatedEl) translatedEl.textContent = response.translated;
        if (statusEl) statusEl.textContent = '';
      } else if (response?.error) {
        if (translatedEl) translatedEl.textContent = '';
        if (statusEl) statusEl.textContent = `⚠ ${response.error}`;
      }
    } catch (err) {
      console.error('[Meet Translator] Translation error:', err);
      if (statusEl) statusEl.textContent = '⚠ Lỗi kết nối đến extension';
    }
  }

  // ── MutationObserver for Captions ──────────────────────
  function startObserving() {
    // Observe the whole document body for caption elements appearing
    observer = new MutationObserver(() => {
      const container = findCaptionContainer();
      if (!container) return;

      const text = extractCaptionText(container);
      if (!text) return;

      // Debounce to let caption text stabilize
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleCaptionUpdate(text);
      }, DEBOUNCE_MS);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    console.log('[Meet Translator] Caption observer started');
  }

  // ── Initialize ─────────────────────────────────────────
  async function init() {
    console.log('[Meet Translator] Initializing on Google Meet...');

    // Load settings
    try {
      const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (settings?.targetLanguage) {
        targetLanguage = settings.targetLanguage;
      }
    } catch (err) {
      console.warn('[Meet Translator] Could not load settings:', err);
    }

    // Create UI
    createOverlay();

    // Start observing captions
    startObserving();

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.targetLanguage) {
        targetLanguage = changes.targetLanguage.newValue;
        const statusEl = document.getElementById('mt-status');
        if (statusEl) statusEl.textContent = `Ngôn ngữ: ${targetLanguage}`;
      }
    });
  }

  // Wait for page to be ready
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
