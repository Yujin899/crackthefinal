// loader.js
// Improved tooth-shaped SVG spinner with show/hide controls

const loaderHtml = `
<div id="app-loader" class="fixed inset-0 flex items-center justify-center bg-white z-50" style="display: none;">
  <div class="flex flex-col items-center gap-4" style="will-change: transform, opacity;">
    <!-- Circular spinner SVG -->
    <svg id="spinner-svg" width="96" height="96" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <circle cx="25" cy="25" r="20" stroke="#e6f7ff" stroke-width="6" fill="none" />
      <path id="spinner-arc" d="M45 25a20 20 0 00-40 0" stroke="#0ea5e9" stroke-width="6" stroke-linecap="round" fill="none" stroke-dasharray="62.8" stroke-dashoffset="0" />
    </svg>
    <div id="loader-text" class="text-slate-700 font-medium">Loading...</div>
  </div>
</div>
`;

let minShowTimer = null;
let containerCreated = false;

function ensureContainer() {
  if (!containerCreated && typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.innerHTML = loaderHtml;
    document.body.appendChild(div.firstElementChild);
    containerCreated = true;

    // start animations for circular spinner
    const arc = document.getElementById('spinner-arc');
    const svg = document.getElementById('spinner-svg');
    const wrapper = document.querySelector('#app-loader > div');

    if (arc) {
      // rotate the arc by animating the parent SVG
      svg.animate([
        { transform: 'rotate(0deg)', transformOrigin: '50% 50%' },
        { transform: 'rotate(360deg)', transformOrigin: '50% 50%' }
      ], {
        duration: 1000,
        iterations: Infinity,
        easing: 'linear'
      });
      // animate arc dash for breathing effect
      arc.animate([
        { strokeDashoffset: 62.8 },
        { strokeDashoffset: 15 }
      ], {
        duration: 900,
        iterations: Infinity,
        direction: 'alternate',
        easing: 'ease-in-out'
      });
    }

    if (wrapper) {
      wrapper.animate([
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(-6px) scale(1.02)' }
      ], {
        duration: 1400,
        iterations: Infinity,
        direction: 'alternate',
        easing: 'ease-in-out'
      });
    }
  }
}

export function showLoader(text = 'Loading...', { minDuration = 300 } = {}) {
  if (typeof document === 'undefined') return;
  ensureContainer();
  const loader = document.getElementById('app-loader');
  const txt = document.getElementById('loader-text');
  if (txt) txt.textContent = text;
  if (loader) loader.style.display = 'flex';

  // enforce a minimum visible time to avoid flicker
  if (minShowTimer) clearTimeout(minShowTimer);
  minShowTimer = setTimeout(() => {
    minShowTimer = null;
  }, minDuration);
}

export function hideLoader() {
  const loader = document.getElementById('app-loader');
  // if a minimum show timer is active, wait until it's cleared
  if (minShowTimer) {
    const to = setInterval(() => {
      if (!minShowTimer) {
        clearInterval(to);
        if (loader) loader.style.display = 'none';
      }
    }, 50);
  } else {
    if (loader) loader.style.display = 'none';
  }
}

export default { showLoader, hideLoader };

// Auto-show loader immediately on module import so pages importing this
// won't reveal content until they explicitly hide the loader.
// This ensures the overlay covers the page from the earliest possible moment.
try {
  if (typeof document !== 'undefined') {
    ensureContainer();
    const initial = document.getElementById('app-loader');
    if (initial) initial.style.display = 'flex';
  }
} catch (e) {
  // ignore in non-browser contexts
}
