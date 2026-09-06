/**
 * The Dubai Guy — chat widget
 * Embed with:
 *   <link rel="stylesheet" href="/chat-widget.css">
 *   <script src="/chat-widget.js" defer></script>
 *
 * Talks to /api/chat and /api/status (see /api folder). No build step required.
 */
(function () {
  const API_CHAT = '/api/chat';
  const API_STATUS = '/api/status';
  const SESSION_KEY = 'tdg_chat_session';
  const HISTORY_KEY = 'tdg_chat_history';

  const QUICK_REPLIES = [
    { label: 'Sizing help', text: 'Can you help me with sizing?' },
    { label: 'Shipping', text: 'How long does shipping take?' },
    { label: 'Returns', text: 'What is your return policy?' },
    { label: 'Track my order', text: 'I want to check my order status.' }
  ];

  function uid() {
    return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getSessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uid();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function loadHistory() {
    try {
      return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveHistory(history) {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function buildWidget() {
    const root = el('div');
    root.id = 'tdg-chat-root';

    const launcher = el('button', 'tdg-launcher');
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.style.position = 'relative';
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    const launcherDot = el('span', 'tdg-launcher-dot offline');
    launcher.appendChild(launcherDot);

    const panel = el('div', 'tdg-panel');
    panel.innerHTML = `
      <div class="tdg-header">
        <div class="tdg-header-brand">
          <span class="tdg-wordmark">THE DUBAI GUY</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="tdg-status-pill"><span class="tdg-status-dot offline"></span><span class="tdg-status-text">Checking…</span></span>
          <button class="tdg-close" aria-label="Close chat">&times;</button>
        </div>
      </div>
      <div class="tdg-away-banner">We're away right now — our assistant can help, and we'll follow up personally on anything it can't resolve.</div>
      <div class="tdg-quick-replies"></div>
      <div class="tdg-messages"></div>
      <div class="tdg-input-row">
        <textarea class="tdg-input" rows="1" placeholder="Ask about sizing, shipping, returns…"></textarea>
        <button class="tdg-send" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
      </div>
    `;

    root.appendChild(panel);
    root.appendChild(launcher);
    document.body.appendChild(root);

    return { root, launcher, launcherDot, panel };
  }

  function init() {
    const { launcher, launcherDot, panel } = buildWidget();
    const messagesEl = panel.querySelector('.tdg-messages');
    const inputEl = panel.querySelector('.tdg-input');
    const sendBtn = panel.querySelector('.tdg-send');
    const closeBtn = panel.querySelector('.tdg-close');
    const quickRepliesEl = panel.querySelector('.tdg-quick-replies');
    const statusDot = panel.querySelector('.tdg-status-dot');
    const statusText = panel.querySelector('.tdg-status-text');
    const awayBanner = panel.querySelector('.tdg-away-banner');

    const sessionId = getSessionId();
    let history = loadHistory();
    let isOnline = false;
    let sending = false;

    // Quick reply chips
    QUICK_REPLIES.forEach((qr) => {
      const chip = el('button', 'tdg-chip', qr.label);
      chip.addEventListener('click', () => sendMessage(qr.text));
      quickRepliesEl.appendChild(chip);
    });

    function renderMessage(role, text) {
      const bubble = el('div', 'tdg-msg ' + role, escapeHtml(text));
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderSystem(text) {
      const bubble = el('div', 'tdg-msg system', escapeHtml(text));
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function escapeHtml(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    function showTyping() {
      const t = el('div', 'tdg-typing', '<span></span><span></span><span></span>');
      t.id = 'tdg-typing-indicator';
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
      const t = document.getElementById('tdg-typing-indicator');
      if (t) t.remove();
    }

    async function refreshStatus() {
      try {
        const res = await fetch(API_STATUS);
        const data = await res.json();
        isOnline = !!data.online;
      } catch (e) {
        isOnline = false;
      }
      statusDot.classList.toggle('offline', !isOnline);
      launcherDot.classList.toggle('offline', !isOnline);
      statusText.textContent = isOnline ? 'Online now' : 'Away — assistant is here';
      awayBanner.classList.toggle('show', !isOnline);
    }

    async function sendMessage(textArg) {
      const text = (textArg !== undefined ? textArg : inputEl.value).trim();
      if (!text || sending) return;

      sending = true;
      sendBtn.disabled = true;
      inputEl.value = '';
      renderMessage('user', text);
      history.push({ role: 'user', content: text });
      saveHistory(history);
      showTyping();

      try {
        const res = await fetch(API_CHAT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: text,
            history: history.slice(0, -1) // history before this turn
          })
        });
        const data = await res.json();
        hideTyping();

        if (data.reply) {
          renderMessage('bot', data.reply);
          history.push({ role: 'assistant', content: data.reply });
          saveHistory(history);
        }
        if (data.escalated) {
          renderSystem("We've flagged this for a team member to follow up personally.");
        }
      } catch (e) {
        hideTyping();
        renderSystem("Something went wrong sending that — please try again in a moment.");
      } finally {
        sending = false;
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }

    // Restore prior messages in this session
    history.forEach((m) => renderMessage(m.role === 'user' ? 'user' : 'bot', m.content));
    if (history.length === 0) {
      renderMessage('bot', "Assalamualaikum! Welcome to The Dubai Guy — ask me about sizing, shipping, returns, or your order, and I'll help right away.");
    }

    launcher.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        refreshStatus();
        inputEl.focus();
      }
    });
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));

    sendBtn.addEventListener('click', () => sendMessage());
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
    });

    refreshStatus();
    setInterval(refreshStatus, 60000); // recheck availability every minute
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
