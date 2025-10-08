// theme.js
// Centralized theme management for the site. Supports 'system', 'light', 'dark'.

const THEME_KEY = 'ctf-theme';

export function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

export function saveTheme(t) {
  localStorage.setItem(THEME_KEY, t);
}

export function applyTheme(mode) {
  const html = document.documentElement;
  // ensure dark styles are present so toggling has visible effect
  ensureDarkStyles();
  if (mode === 'dark') {
    html.classList.add('dark');
  } else if (mode === 'light') {
    html.classList.remove('dark');
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) html.classList.add('dark'); else html.classList.remove('dark');
  }
}

function ensureDarkStyles() {
  if (document.getElementById('ctf-dark-styles')) return;
  const css = `
html.dark { --ctf-bg: #0b1220; --ctf-panel: #0f1724; --ctf-text: #e6eef8; --ctf-muted: #9aa4b2; --ctf-accent: #3b82f6; }
html.dark body { background-color: var(--ctf-bg) !important; color: var(--ctf-text) !important; }
html.dark header, html.dark .bg-white, html.dark .bg-gray-50 { background-color: var(--ctf-panel) !important; }
html.dark .text-gray-500, html.dark .text-slate-500, html.dark .text-gray-400, html.dark .text-gray-600 { color: var(--ctf-muted) !important; }
html.dark .text-slate-700, html.dark .text-gray-800, html.dark .font-semibold, html.dark .text-slate-900 { color: var(--ctf-text) !important; }
html.dark .bg-gray-300, html.dark .bg-slate-200, html.dark .bg-gray-100 { background-color: #0b1220 !important; }
html.dark .border-gray-200 { border-color: #2d3748 !important; }
html.dark .bg-blue-500 { background-color: #2563eb !important; }
html.dark .bg-red-500 { background-color: #dc2626 !important; }
html.dark .rounded-lg, html.dark .rounded-md { background-clip: padding-box; }
html.dark a.text-blue-500 { color: var(--ctf-accent) !important; }
html.dark .shadow-md, html.dark .shadow-lg, html.dark .shadow-sm { box-shadow: 0 6px 18px rgba(2,6,23,0.6) !important; }
/* Quiz result preview: provide neutral/correct/wrong mark styles and panel background for results */
.ctf-result-wrap { background-color: rgba(255,255,255,0.8); }
.ctf-result-question { color: #0f1724; }
.ctf-mark-correct { background: #10b981; }
.ctf-mark-wrong { background: #ef4444; }
.ctf-mark-neutral { border: 1px solid #e5e7eb; }
.ctf-points { color: #374151; }
html.dark .ctf-result-wrap { background-color: var(--ctf-panel) !important; border-color: rgba(255,255,255,0.04) !important; }
html.dark .ctf-result-question { color: var(--ctf-text) !important; }
html.dark .ctf-mark-correct { background: #059669 !important; }
html.dark .ctf-mark-wrong { background: #dc2626 !important; }
html.dark .ctf-mark-neutral { border-color: rgba(255,255,255,0.06) !important; }
html.dark .ctf-points { color: var(--ctf-muted) !important; }
/* Quiz specific tweaks: arrows and header/nav */
html.dark #nav-left, html.dark #nav-right {
  background-color: transparent !important;
  color: var(--ctf-text) !important;
  transition: background-color 160ms ease, color 160ms ease;
}
/* Stronger hover selector: include button#... and increase contrast slightly to be visible on dark panels */
/* Dark mode: make hover color a darker, more visible blue (not a light tint)
   so the icon/text appears darker (higher contrast) on hover. */
html.dark button#nav-left:hover, html.dark button#nav-right:hover,
html.dark #nav-left:hover, html.dark #nav-right:hover {
  /* make the hover background solid blue-400 in dark mode and use white icon for contrast */
  background-color: #60A5FA !important;
  color: #fff !important;
  box-shadow: 0 8px 24px rgba(96,165,250,0.18) !important;
}

/* Light mode: ensure hover makes the icon/text darker (not lighter) */
html:not(.dark) button#nav-left:hover, html:not(.dark) button#nav-right:hover,
html:not(.dark) #nav-left:hover, html:not(.dark) #nav-right:hover {
  background-color: rgba(96,165,250,0.08) !important; /* subtle blue-400 tint */
  color: #60A5FA !important; /* blue-400 hover text */
  box-shadow: 0 6px 18px rgba(2,6,23,0.06) !important;
}
/* If the right nav is the submit (blue) ensure hover is darker blue */
html.dark #nav-right.bg-blue-500:hover { background-color: #1e40af !important; }
/* Mobile bottom nav */
html.dark #mobile-nav { background-color: rgba(2,6,23,0.6) !important; }
html.dark #mobile-nav button { color: var(--ctf-text) !important; }
/* Question header bar */
html.dark #question-header-bar { background-color: var(--ctf-panel) !important; color: var(--ctf-text) !important; border-bottom: 1px solid rgba(255,255,255,0.03); }

/* Profile: ensure username text is light and readable in dark mode */
html.dark #username-header, html.dark #profile-username, html.dark .profile-username {
  color: var(--ctf-text) !important;
}

/* Auth page inputs: make them readable in dark mode */
html.dark .auth-input {
  background-color: #0b1220 !important; /* match panel */
  color: var(--ctf-text) !important;
  border-color: rgba(255,255,255,0.06) !important;
}
html.dark .auth-input::placeholder { color: rgba(230,238,248,0.6) !important; }

/* Admin inputs: ensure readability in dark mode */
html.dark .form-input {
  background-color: #0b1220 !important;
  color: var(--ctf-text) !important;
  border-color: rgba(255,255,255,0.06) !important;
}
html.dark .form-input::placeholder { color: rgba(230,238,248,0.6) !important; }
html.dark .form-label { color: var(--ctf-text) !important; }

/* Admin cards: use the panel color and increase contrast for text and controls */
html.dark .admin-card {
  background-color: var(--ctf-panel) !important;
  color: var(--ctf-text) !important;
  box-shadow: 0 6px 18px rgba(2,6,23,0.6) !important;
  border: 1px solid rgba(255,255,255,0.04) !important;
}
html.dark .admin-card h1, html.dark .admin-card h2, html.dark .admin-card .form-label {
  color: var(--ctf-text) !important;
}
html.dark .admin-card .submit-btn {
  background-color: #2563eb !important; /* slightly darker blue for buttons in dark mode */
}
html.dark .admin-card .submit-btn:hover { background-color: #1e40af !important; }

/* Mobile nav buttons (small screens) - ensure hover matches desktop arrows */
html.dark #nav-left-mobile:hover, html.dark #nav-right-mobile:hover, html.dark #mobile-nav button:hover {
  background-color: #60A5FA !important; /* blue-400 */
  color: #fff !important;
  box-shadow: 0 8px 24px rgba(96,165,250,0.18) !important;
}

/* Light mode mobile hover: subtle blue tint and blue-400 icon */
html:not(.dark) #nav-left-mobile:hover, html:not(.dark) #nav-right-mobile:hover, html:not(.dark) #mobile-nav button:hover {
  background-color: rgba(96,165,250,0.08) !important;
  color: #60A5FA !important;
  box-shadow: 0 6px 18px rgba(2,6,23,0.06) !important;
}
`;
  const style = document.createElement('style');
  style.id = 'ctf-dark-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

export function initThemeListener(onChange) {
  if (!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e) => {
    // only notify if user selected 'system'
    if (getSavedTheme() === 'system') {
      applyTheme('system');
      if (onChange) onChange('system');
    }
  };
  mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
  return () => { mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler); };
}

export function initTheme() {
  const t = getSavedTheme();
  applyTheme(t);
  return t;
}

export function setTheme(t) {
  saveTheme(t);
  applyTheme(t);
}

export default {
  getSavedTheme,
  saveTheme,
  applyTheme,
  initThemeListener,
  initTheme,
  setTheme
};
