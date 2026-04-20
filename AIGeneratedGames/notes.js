(function () {
  const STORAGE_KEY = 'aigg_notes_v1';
  let gamesIndex = null;
  let overlayEl = null;
  let viewMode = 'current'; // 'current' | 'all'

  function getContextId() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].startsWith('day-') || parts[i].startsWith('game-')) {
        return parts[i];
      }
    }
    return '_index';
  }

  function getContextTitle(id) {
    if (id === '_index') return 'AI-Generated Games (Index)';
    if (gamesIndex) {
      const match = gamesIndex.find(function (g) { return g.dir === id; });
      if (match && match.title) return match.title;
    }
    const headerTitle = document.querySelector('.gad-title');
    if (headerTitle && headerTitle.textContent.trim()) {
      return headerTitle.textContent.trim();
    }
    return id;
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      alert('Could not save note: storage unavailable.');
    }
  }

  function addNote(ctxId, title, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const all = loadAll();
    if (!all[ctxId]) all[ctxId] = { title: title, notes: [] };
    all[ctxId].title = title;
    all[ctxId].notes.push({ text: trimmed, ts: Date.now() });
    saveAll(all);
  }

  function deleteNote(ctxId, index) {
    const all = loadAll();
    if (!all[ctxId] || !all[ctxId].notes[index]) return;
    all[ctxId].notes.splice(index, 1);
    if (all[ctxId].notes.length === 0) delete all[ctxId];
    saveAll(all);
  }

  function clearContext(ctxId) {
    const all = loadAll();
    if (all[ctxId]) {
      delete all[ctxId];
      saveAll(all);
    }
  }

  function clearAll() {
    saveAll({});
  }

  function exportAllAsText() {
    const all = loadAll();
    const keys = Object.keys(all);
    if (keys.length === 0) return 'No notes yet.';
    const lines = [];
    keys.sort().forEach(function (id) {
      const entry = all[id];
      if (!entry.notes || entry.notes.length === 0) return;
      lines.push('## ' + entry.title + ' (' + id + ')');
      entry.notes.forEach(function (n) {
        const d = new Date(n.ts);
        const stamp = d.toISOString().replace('T', ' ').slice(0, 16);
        lines.push('- [' + stamp + '] ' + n.text);
      });
      lines.push('');
    });
    return lines.join('\n').trim() || 'No notes yet.';
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toISOString().replace('T', ' ').slice(0, 16);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function injectStyles() {
    if (document.getElementById('aigg-notes-style')) return;
    const style = document.createElement('style');
    style.id = 'aigg-notes-style';
    style.textContent = [
      '.aigg-notes-fab{position:fixed;right:14px;bottom:14px;z-index:2147483646;',
      'background:#1e1e2e;color:#a78bfa;border:1px solid #3b3b5c;border-radius:999px;',
      'padding:10px 14px;font:600 14px system-ui,-apple-system,sans-serif;cursor:pointer;',
      'box-shadow:0 4px 14px rgba(0,0,0,0.4);-webkit-tap-highlight-color:transparent;',
      'user-select:none;display:flex;align-items:center;gap:6px;min-height:44px;}',
      '.aigg-notes-fab:hover,.aigg-notes-fab:active{border-color:#a78bfa;background:#2a2a3e;}',
      '.aigg-notes-fab .aigg-badge{background:#a78bfa;color:#0f0f1a;border-radius:999px;',
      'font-size:11px;font-weight:700;padding:1px 6px;min-width:18px;text-align:center;}',
      '.aigg-notes-overlay{position:fixed;inset:0;z-index:2147483647;',
      'background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;',
      'padding:16px;font-family:system-ui,-apple-system,sans-serif;}',
      '.aigg-notes-modal{background:#0f0f1a;color:#e0e0ff;border:1px solid #3b3b5c;',
      'border-radius:12px;width:100%;max-width:560px;max-height:90vh;display:flex;',
      'flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.6);}',
      '.aigg-notes-head{display:flex;align-items:center;gap:8px;padding:12px 14px;',
      'border-bottom:1px solid #3b3b5c;}',
      '.aigg-notes-head h3{margin:0;flex:1;font-size:1rem;color:#e0e0ff;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.aigg-notes-close{background:#1e1e2e;color:#a78bfa;border:1px solid #3b3b5c;',
      'border-radius:8px;padding:6px 10px;cursor:pointer;font-size:14px;min-height:32px;}',
      '.aigg-notes-close:hover{border-color:#a78bfa;background:#2a2a3e;}',
      '.aigg-notes-tabs{display:flex;gap:6px;padding:10px 14px 0;}',
      '.aigg-notes-tab{flex:1;background:#1e1e2e;color:#c0c0e0;border:1px solid #3b3b5c;',
      'border-radius:8px;padding:8px;cursor:pointer;font:600 13px inherit;}',
      '.aigg-notes-tab.active{background:#a78bfa;color:#0f0f1a;border-color:#a78bfa;}',
      '.aigg-notes-body{padding:12px 14px;overflow-y:auto;flex:1;',
      '-webkit-overflow-scrolling:touch;}',
      '.aigg-notes-ctx{font-size:12px;color:#8a8ab0;margin-bottom:8px;}',
      '.aigg-notes-ctx strong{color:#c0c0e0;}',
      '.aigg-notes-latest{background:#16162a;border:1px solid #2a2a44;border-radius:8px;',
      'padding:10px;margin-bottom:10px;}',
      '.aigg-notes-latest .lbl{font-size:11px;color:#8a8ab0;text-transform:uppercase;',
      'letter-spacing:0.05em;margin-bottom:4px;}',
      '.aigg-notes-latest .txt{white-space:pre-wrap;word-break:break-word;font-size:14px;}',
      '.aigg-notes-latest .stamp{font-size:11px;color:#6a6a8a;margin-top:4px;}',
      '.aigg-notes-list{list-style:none;padding:0;margin:0 0 10px;}',
      '.aigg-notes-list li{background:#16162a;border:1px solid #2a2a44;border-radius:8px;',
      'padding:8px 10px;margin-bottom:6px;display:flex;gap:8px;align-items:flex-start;}',
      '.aigg-notes-list .txt{flex:1;white-space:pre-wrap;word-break:break-word;font-size:13px;}',
      '.aigg-notes-list .stamp{font-size:10px;color:#6a6a8a;margin-top:2px;display:block;}',
      '.aigg-notes-del{background:transparent;color:#ff6b8a;border:1px solid #4a2a3a;',
      'border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px;min-height:28px;}',
      '.aigg-notes-del:hover{background:#3a1a2a;border-color:#ff6b8a;}',
      '.aigg-notes-input{width:100%;min-height:70px;max-height:220px;resize:vertical;',
      'background:#16162a;color:#e0e0ff;border:1px solid #3b3b5c;border-radius:8px;',
      'padding:10px;font:14px/1.4 inherit;box-sizing:border-box;}',
      '.aigg-notes-input:focus{outline:none;border-color:#a78bfa;}',
      '.aigg-notes-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;}',
      '.aigg-notes-btn{background:#1e1e2e;color:#a78bfa;border:1px solid #3b3b5c;',
      'border-radius:8px;padding:8px 12px;cursor:pointer;font:600 13px inherit;min-height:36px;}',
      '.aigg-notes-btn:hover{border-color:#a78bfa;background:#2a2a3e;}',
      '.aigg-notes-btn.primary{background:#a78bfa;color:#0f0f1a;border-color:#a78bfa;}',
      '.aigg-notes-btn.primary:hover{background:#b99dfb;}',
      '.aigg-notes-btn.danger{color:#ff6b8a;border-color:#4a2a3a;}',
      '.aigg-notes-btn.danger:hover{background:#3a1a2a;border-color:#ff6b8a;}',
      '.aigg-notes-empty{color:#6a6a8a;font-size:13px;font-style:italic;padding:8px 0;}',
      '.aigg-notes-all{background:#0a0a14;border:1px solid #2a2a44;border-radius:8px;',
      'padding:10px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;',
      'word-break:break-word;color:#c0c0e0;max-height:50vh;overflow:auto;}',
      '.aigg-notes-hint{font-size:11px;color:#6a6a8a;margin-top:6px;}',
      ''
    ].join('');
    document.head.appendChild(style);
  }

  function renderCurrent(ctxId, ctxTitle) {
    const all = loadAll();
    const entry = all[ctxId];
    const notes = entry && entry.notes ? entry.notes.slice().reverse() : [];
    const latest = notes[0];

    let html = '<div class="aigg-notes-ctx">Notes for <strong>' +
      escapeHtml(ctxTitle) + '</strong> <span style="color:#6a6a8a;">(' +
      escapeHtml(ctxId) + ')</span></div>';

    if (latest) {
      html += '<div class="aigg-notes-latest">' +
        '<div class="lbl">Latest note</div>' +
        '<div class="txt">' + escapeHtml(latest.text) + '</div>' +
        '<div class="stamp">' + escapeHtml(formatDate(latest.ts)) + '</div>' +
        '</div>';
    } else {
      html += '<div class="aigg-notes-empty">No notes yet for this screen. Add one below.</div>';
    }

    html += '<textarea class="aigg-notes-input" placeholder="Write a bug or feedback note..."></textarea>' +
      '<div class="aigg-notes-actions">' +
      '<button class="aigg-notes-btn primary" data-act="add">Add note</button>' +
      (notes.length > 0 ? '<button class="aigg-notes-btn danger" data-act="clear-ctx">Clear all for this screen</button>' : '') +
      '</div>' +
      '<div class="aigg-notes-hint">Cmd/Ctrl+Enter to add. Notes saved to this browser.</div>';

    if (notes.length > 1) {
      html += '<div style="margin-top:14px;font-size:12px;color:#8a8ab0;">Earlier notes</div>';
      html += '<ul class="aigg-notes-list">';
      notes.slice(1).forEach(function (n, i) {
        // original index in stored (non-reversed) array:
        const origIdx = entry.notes.length - 1 - (i + 1);
        html += '<li>' +
          '<div style="flex:1;">' +
            '<div class="txt">' + escapeHtml(n.text) + '</div>' +
            '<span class="stamp">' + escapeHtml(formatDate(n.ts)) + '</span>' +
          '</div>' +
          '<button class="aigg-notes-del" data-act="del" data-idx="' + origIdx + '">Delete</button>' +
        '</li>';
      });
      html += '</ul>';
    }

    return html;
  }

  function renderAll() {
    const text = exportAllAsText();
    const hasNotes = text !== 'No notes yet.';
    return '<div class="aigg-notes-ctx">All notes across every screen. Copy this to share with Claude.</div>' +
      '<pre class="aigg-notes-all" id="aigg-notes-all-text">' + escapeHtml(text) + '</pre>' +
      '<div class="aigg-notes-actions">' +
        '<button class="aigg-notes-btn primary" data-act="copy-all"' + (hasNotes ? '' : ' disabled') + '>Copy all</button>' +
        '<button class="aigg-notes-btn danger" data-act="clear-all"' + (hasNotes ? '' : ' disabled') + '>Clear ALL notes</button>' +
      '</div>';
  }

  function render() {
    if (!overlayEl) return;
    const ctxId = getContextId();
    const ctxTitle = getContextTitle(ctxId);
    const body = overlayEl.querySelector('.aigg-notes-body');
    const tabCurrent = overlayEl.querySelector('[data-tab="current"]');
    const tabAll = overlayEl.querySelector('[data-tab="all"]');
    tabCurrent.classList.toggle('active', viewMode === 'current');
    tabAll.classList.toggle('active', viewMode === 'all');
    body.innerHTML = viewMode === 'current' ? renderCurrent(ctxId, ctxTitle) : renderAll();
    updateBadge();
  }

  function updateBadge() {
    const fab = document.getElementById('aigg-notes-fab');
    if (!fab) return;
    const all = loadAll();
    const ctxId = getContextId();
    const count = all[ctxId] && all[ctxId].notes ? all[ctxId].notes.length : 0;
    const badge = fab.querySelector('.aigg-badge');
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function openOverlay() {
    viewMode = 'current';
    if (overlayEl) {
      overlayEl.style.display = '';
      render();
      focusInput();
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'aigg-notes-overlay';
    wrap.innerHTML =
      '<div class="aigg-notes-modal" role="dialog" aria-modal="true" aria-label="Notes">' +
        '<div class="aigg-notes-head">' +
          '<h3>Notes</h3>' +
          '<button class="aigg-notes-close" data-act="close" aria-label="Close">Close</button>' +
        '</div>' +
        '<div class="aigg-notes-tabs">' +
          '<button class="aigg-notes-tab active" data-tab="current">This screen</button>' +
          '<button class="aigg-notes-tab" data-tab="all">All notes</button>' +
        '</div>' +
        '<div class="aigg-notes-body"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    overlayEl = wrap;

    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) closeOverlay();
    });
    wrap.addEventListener('click', handleClick);
    wrap.addEventListener('keydown', handleKey);
    render();
    focusInput();
  }

  function closeOverlay() {
    if (overlayEl) overlayEl.style.display = 'none';
    updateBadge();
  }

  function focusInput() {
    setTimeout(function () {
      const input = overlayEl && overlayEl.querySelector('.aigg-notes-input');
      if (input) input.focus();
    }, 30);
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      closeOverlay();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      const input = overlayEl.querySelector('.aigg-notes-input');
      if (input && document.activeElement === input) {
        submitCurrent();
      }
    }
  }

  function submitCurrent() {
    const input = overlayEl.querySelector('.aigg-notes-input');
    if (!input) return;
    const ctxId = getContextId();
    const ctxTitle = getContextTitle(ctxId);
    addNote(ctxId, ctxTitle, input.value);
    render();
    focusInput();
  }

  function handleClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      viewMode = tab.getAttribute('data-tab');
      render();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const ctxId = getContextId();

    if (act === 'close') {
      closeOverlay();
    } else if (act === 'add') {
      submitCurrent();
    } else if (act === 'del') {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      if (!isNaN(idx) && confirm('Delete this note?')) {
        deleteNote(ctxId, idx);
        render();
      }
    } else if (act === 'clear-ctx') {
      if (confirm('Clear all notes for this screen?')) {
        clearContext(ctxId);
        render();
      }
    } else if (act === 'copy-all') {
      const text = exportAllAsText();
      copyText(text).then(function (ok) {
        btn.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(function () { btn.textContent = 'Copy all'; }, 1500);
      });
    } else if (act === 'clear-all') {
      if (confirm('Clear EVERY note across all screens? This cannot be undone.')) {
        clearAll();
        render();
      }
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; })
        .catch(function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function injectFab() {
    if (document.getElementById('aigg-notes-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'aigg-notes-fab';
    btn.className = 'aigg-notes-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open notes');
    btn.innerHTML = '<span aria-hidden="true">&#128221;</span><span>Notes</span><span class="aigg-badge" style="display:none;">0</span>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openOverlay();
    });
    document.body.appendChild(btn);
    updateBadge();
  }

  function findGamesJsonUrl() {
    const path = window.location.pathname;
    const parts = path.split('/');
    const dirIndex = parts.length - 2;
    const dir = parts[dirIndex];
    if (dir && (dir.startsWith('day-') || dir.startsWith('game-'))) {
      return '../games.json';
    }
    return './games.json';
  }

  function loadGamesIndex() {
    fetch(findGamesJsonUrl())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (Array.isArray(data)) gamesIndex = data;
      })
      .catch(function () { /* ignore */ });
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    injectStyles();
    injectFab();
    loadGamesIndex();
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) {
        updateBadge();
        if (overlayEl && overlayEl.style.display !== 'none') render();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
