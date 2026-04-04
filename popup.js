// popup.js — Settings popup for Meet AI Translator

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const targetLangSelect = document.getElementById('target-lang');
  const toggleKeyBtn = document.getElementById('toggle-key');
  const form = document.getElementById('settings-form');
  const statusMsg = document.getElementById('status-msg');

  // ── Load saved settings ────────────────────────
  try {
    const result = await chrome.storage.local.get(['geminiApiKey', 'targetLanguage']);
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.targetLanguage) {
      targetLangSelect.value = result.targetLanguage;
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }

  // ── Toggle API key visibility ──────────────────
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? '🙈' : '👁';
  });

  // ── Save settings ─────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const targetLanguage = targetLangSelect.value;

    if (!apiKey) {
      showStatus('Vui lòng nhập API key', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({ geminiApiKey: apiKey, targetLanguage });
      showStatus('✓ Đã lưu cài đặt thành công!', 'success');
    } catch (err) {
      console.error('Error saving settings:', err);
      showStatus('Lỗi khi lưu cài đặt', 'error');
    }
  });

  // ── Status message helper ─────────────────────
  function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = `status-msg ${type}`;

    setTimeout(() => {
      statusMsg.className = 'status-msg';
    }, 3000);
  }
});
