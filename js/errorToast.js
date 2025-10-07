// errorToast.js
// Global error-to-toast bridge. Captures window errors, unhandled promise rejections and console.error
// and shows them as dismissible toasts in the top-right corner.

function ensureContainer() {
  let c = document.getElementById('global-toast-container');
  if (c) return c;
  c = document.createElement('div');
  c.id = 'global-toast-container';
  c.style.position = 'fixed';
  c.style.top = '16px';
  c.style.right = '16px';
  c.style.zIndex = 99999;
  c.style.display = 'flex';
  c.style.flexDirection = 'column';
  c.style.gap = '8px';
  c.style.maxWidth = '360px';
  document.body.appendChild(c);
  return c;
}

function createToast(message, opts = {}) {
  const container = ensureContainer();
  const toast = document.createElement('div');
  toast.className = 'ctf-toast';
  toast.style.background = opts.background || '#111827';
  toast.style.color = opts.color || '#fff';
  toast.style.padding = '12px 14px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 6px 18px rgba(2,6,23,0.4)';
  toast.style.fontSize = '13px';
  toast.style.lineHeight = '1.25';
  toast.style.display = 'flex';
  toast.style.alignItems = 'flex-start';
  toast.style.justifyContent = 'space-between';

  const content = document.createElement('div');
  content.style.flex = '1 1 auto';
  content.style.marginRight = '8px';
  content.textContent = message;

  const close = document.createElement('button');
  close.textContent = '×';
  close.title = 'Dismiss';
  close.style.background = 'transparent';
  close.style.border = 'none';
  close.style.color = opts.color || '#fff';
  close.style.fontSize = '16px';
  close.style.cursor = 'pointer';
  close.addEventListener('click', () => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  });

  toast.appendChild(content);
  toast.appendChild(close);
  container.appendChild(toast);

  const duration = typeof opts.duration === 'number' ? opts.duration : 8000;
  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, duration);
  }
}

// Public helper
export function showErrorToast(msg, opts = {}) {
  try {
    const text = typeof msg === 'string' ? msg : (msg && msg.stack) ? msg.stack : String(msg);
    // Trim long stack traces to reasonable length
    const max = opts.maxLength || 1000;
    const truncated = text.length > max ? text.slice(0, max) + '\n... (truncated)' : text;
    createToast(truncated, opts);
  } catch (e) {
    // fallback no-op
    console.error('Failed to show toast', e);
  }
}

// Init: wire global error capture
(function init() {
  // capture errors
  window.addEventListener('error', (ev) => {
    try {
      const m = ev.error ? (ev.error.stack || ev.error.message || String(ev.error)) : (ev.message || 'Unknown error');
      showErrorToast(String(m), { background: '#b91c1c' });
    } catch (e) { /* ignore */ }
  });

  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = ev.reason;
      const m = reason ? (reason.stack || reason.message || String(reason)) : 'Unhandled rejection';
      showErrorToast(String(m), { background: '#b91c1c' });
    } catch (e) { /* ignore */ }
  });

  // Wrap console.error to surface messages too
  try {
    const orig = console.error.bind(console);
    console.error = function (...args) {
      try {
        const text = args.map(a => (typeof a === 'string' ? a : (a && a.stack) ? a.stack : JSON.stringify(a, null, 2))).join(' ');
        showErrorToast(text, { background: '#b91c1c' });
      } catch (e) { /* ignore */ }
      orig(...args);
    };
  } catch (e) { /* ignore */ }
})();
