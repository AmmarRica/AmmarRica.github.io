(function () {
  const BASE = getBasePath();
  let games = [];
  let currentIndex = -1;

  function getBasePath() {
    const path = window.location.pathname;
    const parts = path.split('/');
    const dirIndex = parts.length - 2;
    const dir = parts[dirIndex];
    if (dir && (dir.startsWith('day-') || dir.startsWith('game-'))) {
      return '../';
    }
    return './';
  }

  function getCurrentDir() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].startsWith('day-') || parts[i].startsWith('game-')) {
        return parts[i];
      }
    }
    return null;
  }

  function extractHowToPlay() {
    const selectors = [
      '#info', '.info', '#instructions', '.instructions',
      '#how-to-play', '.how-to-play', '#controls', '.controls',
      '.subtitle'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 5) {
        return el.textContent.trim();
      }
    }
    const allEls = document.querySelectorAll('p, div, span');
    for (const el of allEls) {
      const t = el.textContent.trim().toLowerCase();
      if ((t.includes('click') || t.includes('tap') || t.includes('arrow') ||
           t.includes('wasd') || t.includes('space') || t.includes('drag')) &&
          t.length < 200 && t.length > 10) {
        return el.textContent.trim();
      }
    }
    return '';
  }

  function buildHeader(headerHTML) {
    const dir = getCurrentDir();
    if (!dir) return;

    currentIndex = games.findIndex(g => g.dir === dir);
    if (currentIndex === -1) return;

    const game = games[currentIndex];
    const prev = currentIndex > 0 ? games[currentIndex - 1] : null;
    const next = currentIndex < games.length - 1 ? games[currentIndex + 1] : null;
    const howToPlay = extractHowToPlay();

    // Remove any existing nav-bar or nav elements
    document.querySelectorAll('.nav-bar, nav').forEach(el => el.remove());

    // Inject the header HTML
    const container = document.createElement('div');
    container.innerHTML = headerHTML;

    // Extract style and elements
    const style = container.querySelector('style');
    if (style) document.head.appendChild(style);

    const header = container.querySelector('.gad-header');
    const spacer = container.querySelector('.gad-spacer');
    if (!header) return;

    // Populate data
    header.querySelector('.gad-title').textContent = game.title;

    const prevBtn = header.querySelector('.gad-prev');
    if (prev) {
      prevBtn.href = BASE + prev.dir + '/index.html';
    } else {
      prevBtn.classList.add('disabled');
    }

    const nextBtn = header.querySelector('.gad-next');
    if (next) {
      nextBtn.href = BASE + next.dir + '/index.html';
    } else {
      nextBtn.classList.add('disabled');
    }

    header.querySelector('.gad-home').href = BASE + 'index.html';

    const panel = header.querySelector('.gad-help-panel');
    if (howToPlay) panel.textContent = howToPlay;

    const helpBtn = header.querySelector('.gad-help-toggle');
    helpBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.toggle('open');
      helpBtn.classList.toggle('active');
    });

    const fsBtn = header.querySelector('.gad-fullscreen');
    if (fsBtn) {
      function updateFsIcon() {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement ||
                        document.mozFullScreenElement || document.msFullscreenElement);
        fsBtn.innerHTML = isFs ? '&#x2715;' : '&#x26F6;';
        fsBtn.setAttribute('aria-label', isFs ? 'Exit fullscreen' : 'Toggle fullscreen');
      }
      fsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement ||
                        document.mozFullScreenElement || document.msFullscreenElement);
        if (!isFs) {
          const el = document.documentElement;
          if (el.requestFullscreen) el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
          else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
          else if (el.msRequestFullscreen) el.msRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
          else if (document.msExitFullscreen) document.msExitFullscreen();
        }
      });
      document.addEventListener('fullscreenchange', updateFsIcon);
      document.addEventListener('webkitfullscreenchange', updateFsIcon);
      document.addEventListener('mozfullscreenchange', updateFsIcon);
      document.addEventListener('MSFullscreenChange', updateFsIcon);
    }

    // Insert into page
    if (spacer) document.body.insertBefore(spacer, document.body.firstChild);
    document.body.insertBefore(header, document.body.firstChild);
  }

  function init() {
    Promise.all([
      fetch(BASE + 'games.json').then(r => r.json()),
      fetch(BASE + 'header.html').then(r => r.text())
    ])
      .then(([data, headerHTML]) => {
        games = data;
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => buildHeader(headerHTML));
        } else {
          buildHeader(headerHTML);
        }
      })
      .catch(() => {
        // Silently fail if files not available
      });
    loadNotesScript();
  }

  function loadNotesScript() {
    if (document.getElementById('aigg-notes-script')) return;
    const s = document.createElement('script');
    s.id = 'aigg-notes-script';
    s.src = BASE + 'notes.js';
    s.async = true;
    document.head.appendChild(s);
  }

  init();
})();
