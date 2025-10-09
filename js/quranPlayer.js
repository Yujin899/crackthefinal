// quranPlayer.js
// Lightweight Quran audio player with a draggable floating button.
// - Persist position in localStorage under 'quranPlayerPos'.
// - Fetch surah audio directly from Quran.com
// - Simple playback with play/pause/stop and volume control.

const STORAGE_KEY_POS = 'quranPlayerPos_v1';
const STORAGE_KEY_STATE = 'quranPlayerState_v1';

function createEl(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstChild;
}

function loadPos() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_POS)); } catch(e){return null}
}
function savePos(pos){ try { localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos)); } catch(e){}
}

function saveState(state){ try { localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state)); } catch(e){}
}
function loadState(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY_STATE)); } catch(e){return null} }

// Quran.com reciter IDs with good audio availability
const RECITERS = [
    { id: '7', name: 'Mishari Rashid al-`Afasy' },
    { id: '4', name: 'Abdul Basit Abdul Samad' },
    { id: '3', name: 'Abdul Rahman Al-Sudais' },
    { id: '1', name: 'Abu Bakr al-Shatri' },
    { id: '2', name: 'Saud Al-Shuraim' },
    { id: '5', name: 'Abdullah Awad Al-Juhany' },
    { id: '6', name: 'Ali Jaber' },
    { id: '9', name: 'Ibrahim Al-Akhdar' },
    { id: '10', name: 'Ahmed Al-Ajmi' },
    { id: '11', name: 'Maher Al-Muaiqly' },
    { id: '12', name: 'Mahmoud Khalil Al-Husary' },
    { id: '13', name: 'Muhammad Siddiq Al-Minshawi' },
    { id: '14', name: 'Fares Ebad ' }
];

// Simple direct playback from Quran.com CDN.
// If the remote host doesn't allow cross-origin requests (missing CORS headers)
// the browser will block playback. We keep the client simple and do a single
// direct blob-fetch fallback; for robust access you must serve audio from a
// CORS-enabled origin or run a proxy on your own server.

// Create styles
const style = document.createElement('style');
style.textContent = `
/* Light-mode defaults */
#quran-player-button{position:fixed !important;right:20px !important;bottom:80px !important;z-index:999999 !important;width:56px;height:56px;border-radius:9999px;background:linear-gradient(135deg,#60a5fa,#3b82f6);display:flex !important;align-items:center;justify-content:center;color:white;box-shadow:0 8px 24px rgba(2,6,23,0.15);cursor:grab;touch-action:none;visibility:visible !important;pointer-events:auto !important}
#quran-player-button:active{cursor:grabbing}
#quran-player-panel{position:fixed;right:20px;bottom:150px;z-index:9999;width:320px;max-width:calc(100% - 40px);background:white;border-radius:12px;box-shadow:0 12px 40px rgba(2,6,23,0.12);overflow:hidden;font-family:inherit;color:#0f1724}
#quran-player-panel .header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9}
#quran-player-panel .body{padding:12px}
#quran-player-panel .controls{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:8px}
#quran-player-panel .small{font-size:12px;color:#64748b}
#quran-player-panel select,input[type=number]{width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px}
#quran-player-panel button{background:#1e40af;color:#fff;padding:8px 10px;border-radius:8px;border:0}
#quran-player-panel .icon-btn{background:#eef2ff;color:#1e3a8a;padding:8px;border-radius:8px;border:0}
#quran-player-panel .volume{width:100%}
@media (max-width:420px){#quran-player-panel{right:10px;left:10px;width:auto;bottom:120px}}
@media (max-width:480px){
    #quran-player-button{width:64px;height:64px;right:14px;bottom:100px}
    #quran-player-button svg{width:26px;height:26px}
}
/* Ensure the button has a sensible default placement on tiny screens */
@media (max-width:360px){
    #quran-player-button{right:10px;bottom:90px}
}

/* Force visibility in case page CSS hides fixed elements on small screens */
#quran-player-button{display:flex !important;visibility:visible !important;opacity:1 !important}

/* Dark mode: use site variables defined by theme.js for consistent look */
html.dark #quran-player-button { background: linear-gradient(135deg, var(--ctf-accent,#60a5fa), #1e40af); box-shadow: 0 8px 24px rgba(2,6,23,0.5); color: var(--ctf-text,#e6eef8); }
html.dark #quran-player-panel { background: var(--ctf-panel,#0f1724); color: var(--ctf-text,#e6eef8); box-shadow: 0 12px 40px rgba(2,6,23,0.6); border: 1px solid rgba(255,255,255,0.04); }
html.dark #quran-player-panel .header { border-bottom-color: rgba(255,255,255,0.03); }
html.dark #quran-player-panel .small { color: var(--ctf-muted,#9aa4b2); }
html.dark #quran-player-panel select, html.dark #quran-player-panel input[type=number] { background: #0b1220; color: var(--ctf-text,#e6eef8); border-color: rgba(255,255,255,0.06); }
html.dark #quran-player-panel .icon-btn { background: rgba(255,255,255,0.04); color: var(--ctf-text,#e6eef8); }
html.dark #quran-player-panel button { background: var(--ctf-accent,#2563eb); color: var(--ctf-text,#e6eef8); }
`;
document.head.appendChild(style);

function init() {
    // Clean up any existing instances
    const existingBtn = document.getElementById('quran-player-button');
    const existingPanel = document.getElementById('quran-player-panel');
    if (existingBtn) existingBtn.remove();
    if (existingPanel) existingPanel.remove();
    
    // Don't initialize on the loading page
    if (window.location.pathname.endsWith('/loader.html')) return;
    
    // Check if user has enabled the Quran player
    const userPrefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
    if (!userPrefs.quranPlayerEnabled) return;

    window.__quranPlayerInited = true;

    const btnHtml = `<button id="quran-player-button" title="Quran Player" aria-label="Quran Player" type="button">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-6.518-3.76A1 1 0 007 8.31v7.38a1 1 0 001.234.97l6.518-1.86a1 1 0 00.748-.97v-3.64a1 1 0 00-.748-.902z"/></svg>
    </button>`;

    const panelHtml = `<div id="quran-player-panel" role="dialog" aria-hidden="true" style="display:none">
        <div class="header">
            <div style="display:flex;gap:8px;align-items:center">
                <strong>Quran Player</strong>
                <span class="small" id="quran-current-surah"></span>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
                <button id="quran-close" class="icon-btn" title="Close">Close</button>
            </div>
        </div>
        <div class="body">
            <div style="display:flex;gap:8px">
                <select id="quran-surah-input" aria-label="Surah" style="width:50%"></select>
                <select id="quran-reciter-select" aria-label="Reciter" style="width:50%"></select>
            </div>
            <!-- No proxy UI: player uses direct API/CDN access. If you see CORS errors,
                 host audio on a CORS-enabled server or use a server-side proxy. -->
            <div style="margin-top:8px;display:block" class="small">Plays directly from public Quran APIs/CDNs. If playback is blocked by CORS, try another reciter or host audio on a CORS-enabled origin.</div>
            <div style="margin-top:10px">
                <div class="controls">
                    <button id="quran-prev" class="icon-btn" title="Previous">⏮️</button>
                    <button id="quran-play" class="icon-btn" title="Play/Pause">▶️</button>
                    <button id="quran-next" class="icon-btn" title="Next">⏭️</button>
                    <button id="quran-stop" class="icon-btn" title="Stop">⏹️</button>
                </div>
                <div style="margin-top:8px">
                    <input id="quran-volume" class="volume" type="range" min="0" max="1" step="0.01" value="0.6" aria-label="Volume" />
                </div>
                <div id="quran-status" class="small" style="margin-top:8px;color:#64748b">Ready</div>
            </div>
        </div>
    </div>`;

    const btn = createEl(btnHtml);
    const panel = createEl(panelHtml);
    document.body.appendChild(btn);
    document.body.appendChild(panel);

        // Ensure the button is visible and within viewport (fix for very small screens where it can be off-canvas)
        function ensureVisible() {
            requestAnimationFrame(() => {
                const rect = btn.getBoundingClientRect();
                const bw = rect.width || 56;
                const bh = rect.height || 56;
                const pad = 8;
                const maxLeft = Math.max(pad, window.innerWidth - bw - pad);
                const maxTop = Math.max(pad, window.innerHeight - bh - pad);

                // If screen is narrow, anchor to bottom-right to guarantee visibility
                if (window.innerWidth <= 480) {
                    btn.style.right = '14px'; btn.style.left = 'auto'; btn.style.bottom = '100px'; btn.style.top = 'auto';
                    btn.style.display = 'flex'; btn.style.visibility = 'visible';
                    return;
                }

                // If the button is off-screen (bottom/right/left/top), move it to a sane default
                if (rect.right < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight || rect.bottom < 0) {
                    btn.style.right = '20px'; btn.style.left = 'auto'; btn.style.bottom = '80px'; btn.style.top = 'auto';
                    btn.style.display = 'flex'; btn.style.visibility = 'visible';
                }

                // If inline left is set, clamp it
                if (btn.style.left) {
                    const curLeft = parseInt(btn.style.left || '0', 10);
                    if (isNaN(curLeft) || curLeft > maxLeft) btn.style.left = Math.max(pad, Math.min(maxLeft, curLeft || pad)) + 'px';
                }
            });
        }
        ensureVisible();

        // Recheck on resize/orientation change (mobile rotation or viewport changes)
        const onResize = () => {
            // If stored pos is now outside, reset to default anchor on small screens
            const posNow = loadPos();
            if (window.innerWidth <= 480) {
                btn.style.right = '14px'; btn.style.left = 'auto'; btn.style.bottom = '100px'; btn.style.top = 'auto';
                savePos({ x: parseInt(btn.style.left || '0') || 0, y: parseInt(btn.style.top || '0') || 0 });
            } else if (posNow) {
                // clamp saved pos
                const bw = btn.offsetWidth || 56; const bh = btn.offsetHeight || 56;
                const maxX = Math.max(8, window.innerWidth - bw - 8);
                const maxY = Math.max(8, window.innerHeight - bh - 8);
                const clampedX = Math.min(Math.max(8, posNow.x), maxX);
                const clampedY = Math.min(Math.max(8, posNow.y), maxY);
                btn.style.left = clampedX + 'px'; btn.style.top = clampedY + 'px'; btn.style.right = 'auto'; btn.style.bottom = 'auto';
                savePos({ x: clampedX, y: clampedY });
            }
            ensureVisible();
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

    const audio = new Audio();
    let playing = false;

    const surahInput = panel.querySelector('#quran-surah-input');
    const playBtn = panel.querySelector('#quran-play');
    const stopBtn = panel.querySelector('#quran-stop');
    const vol = panel.querySelector('#quran-volume');
    const status = panel.querySelector('#quran-status');
    const closeBtn = panel.querySelector('#quran-close');
    const curSurahLabel = panel.querySelector('#quran-current-surah');
    const reciterSelect = panel.querySelector('#quran-reciter-select');

    // Setup reciters dropdown
    RECITERS.forEach(r => {
        const opt = document.createElement('option'); 
        opt.value = r.id; 
        opt.textContent = r.name; 
        reciterSelect.appendChild(opt);
    });
    
    // Restore last used reciter if any
    try {
        const lastReciter = localStorage.getItem('lastReciter');
        if (lastReciter && RECITERS.some(r => r.id === lastReciter)) {
            reciterSelect.value = lastReciter;
        }
    } catch (e) {}

    // Populate surah select with chapter names and handle changes
    async function fetchChapters() {
        try {
            const cached = localStorage.getItem('quranChapters_v1');
            if (cached) return JSON.parse(cached);
            const res = await fetch('https://api.quran.com/api/v4/chapters');
            if (!res.ok) throw new Error('Failed to fetch chapters');
            const data = await res.json();
            const chapters = data.chapters || [];
            try { localStorage.setItem('quranChapters_v1', JSON.stringify(chapters)); } catch(e){}
            return chapters;
        } catch (e) { console.warn('Could not fetch chapters:', e); return []; }
    }

    (async function populateSurahSelect(){
        const chapters = await fetchChapters();
        // Clear and add options
        surahInput.innerHTML = '';
        if (!chapters || chapters.length === 0) {
            const opt = document.createElement('option');
            opt.value = '1';
            opt.textContent = '001 - Surah 1';
            surahInput.appendChild(opt);
        } else {
            chapters.forEach(ch => {
            const opt = document.createElement('option');
            opt.value = String(ch.id);
            opt.textContent = `${String(ch.id).padStart(3,'0')} - ${ch.name_simple || ch.name}`;
            surahInput.appendChild(opt);
            });
        }
        // Ensure a default value
        if (!surahInput.value) surahInput.value = '1';
        surahInput.addEventListener('change', async () => {
            if (playing) {
                try { await loadAndPlay(); } catch(e){ console.warn('Surah change failed:', e); }
            }
        });
    })();

    reciterSelect.addEventListener('change', async () => {
        if (playing) {
            try {
                await loadAndPlay();
            } catch (e) {
                console.warn('Reciter change failed:', e);
            }
        }
    });

    function setStatus(t){ status.textContent = t; }

    // Manage panel visibility and accessibility correctly: use aria-hidden only when hidden
    function updatePanelVisibility(show){
        if (show) {
            panel.style.display = 'block';
            panel.setAttribute('aria-hidden', 'false');
            // focus the first interactive element for keyboard users
            setTimeout(()=>{
                try { const fb = panel.querySelector('button, [href], input, select, textarea'); if (fb) fb.focus(); } catch(e){}
            }, 50);
            saveState(Object.assign({}, loadState()||{}, { visible: true }));
        } else {
            // when hiding, remove focus from any element inside panel and set aria-hidden
            try { if (document.activeElement && panel.contains(document.activeElement)) { document.activeElement.blur(); } } catch(e){}
            panel.style.display = 'none';
            panel.setAttribute('aria-hidden', 'true');
            // return focus to the floating button so screen-reader users regain context
            try { btn.focus(); } catch(e){}
            saveState(Object.assign({}, loadState()||{}, { visible: false }));
        }
    }

    // Auto-play next surah when current one ends
    audio.addEventListener('ended', async () => {
        try {
            const currentSurah = parseInt(surahInput.value || '1', 10);
            if (currentSurah < 114) {
                surahInput.value = currentSurah + 1;
                setStatus('Loading next surah...');
                await loadAndPlay();
            } else {
                playing = false;
                playBtn.textContent = '▶️';
                setStatus('Finished playing all surahs');
            }
        } catch (e) {
            console.warn('Auto-next failed:', e);
            playing = false;
            playBtn.textContent = '▶️';
            setStatus('Finished. Click play for next surah');
        }
    });

    audio.addEventListener('play', ()=>{ playing = true; playBtn.textContent = '⏸️'; setStatus('Playing'); });
    audio.addEventListener('pause', ()=>{ playing = false; playBtn.textContent = '▶️'; setStatus('Paused'); });
    audio.addEventListener('error', (e)=>{
        console.warn('Audio error', e);
        setStatus('Could not play audio. Please try another surah or reciter.');
    });

    vol.addEventListener('input', (e)=>{ audio.volume = parseFloat(e.target.value); saveState({ volume: audio.volume }); });
    // restore volume
    const saved = loadState(); if (saved && typeof saved.volume === 'number') { audio.volume = saved.volume; vol.value = saved.volume; }

    // No proxy URL transformation: play URLs directly.

    async function fetchSurahAudio(surah, reciter) {
        setStatus('Loading surah...');
        try {
            // Get surah name and audio URL from Quran.com API
            const metaRes = await fetch(`https://api.quran.com/api/v4/chapter_recitations/${reciter}/${surah}`);
            if (!metaRes.ok) throw new Error('Could not fetch audio info');
            const audioData = await metaRes.json();
            
            // Get surah name
            const chapterRes = await fetch(`https://api.quran.com/api/v4/chapters/${surah}`);
            if (!chapterRes.ok) throw new Error('Could not fetch surah info');
            const chapterData = await chapterRes.json();
            
            const surahName = chapterData.chapter.name_simple || `Surah ${surah}`;
            const audioUrl = audioData.audio_file.audio_url;
            
            if (!audioUrl) throw new Error('No audio URL found');
            return { url: audioUrl, name: surahName };
        } catch (e) {
            console.warn('Failed to fetch surah:', e);
            setStatus('Could not load surah audio');
            throw e;
        }
    }

    async function loadAndPlay(retryCount = 0) {
        const MAX_RETRIES = 1;
        const s = Math.max(1, Math.min(114, parseInt(String(surahInput.value || '1'), 10)));
        const rec = reciterSelect.value;
        
        // Update select to actual value (in case it was clamped)
        try { surahInput.value = String(s); } catch(e){}
        
        try {
            // Stop current playback
            audio.pause();
            audio.currentTime = 0;
            
            setStatus('Loading Surah ' + s + '...');
            const res = await fetchSurahAudio(s, rec);
            if (!res || !res.url) {
                setStatus('No audio found for this surah');
                return;
            }
            
            // Update UI before loading new audio
            curSurahLabel.textContent = res.name;
            playBtn.textContent = '⏸️';
            
            // Load and play new audio
            audio.src = res.url;
            try {
                await audio.play();
                playing = true;
                setStatus('Playing ' + res.name);
                
                // Save last working reciter as preference
                try {
                    localStorage.setItem('lastReciter', rec);
                } catch (e) {}
                
            } catch (playError) {
                console.warn('Play failed:', playError);
                playBtn.textContent = '▶️';
                
                if (retryCount < MAX_RETRIES) {
                    // Try next reciter
                    const idx = RECITERS.findIndex(r => r.id === rec);
                    const next = RECITERS[(idx + 1) % RECITERS.length];
                    if (next && next.id !== rec) {
                        reciterSelect.value = next.id;
                        setStatus('Trying another reciter...');
                        return loadAndPlay(retryCount + 1);
                    }
                }
                
                setStatus('Could not play audio. Please try another surah or reciter.');
                throw playError;
            }
        } catch (e) {
            console.warn('Failed to load:', e);
            playBtn.textContent = '▶️';
            playing = false;
            setStatus('Could not load audio. Please try another surah or reciter.');
            throw e;
        }
    }

    playBtn.addEventListener('click', async () => {
        try {
            if (!audio.src) { 
                await loadAndPlay(); 
                return; 
            }
            if (playing) { 
                audio.pause(); 
                return; 
            }
            await audio.play();
        } catch (e) {
            console.warn('Play failed:', e);
            setStatus('Could not play audio. Please try another surah or reciter.');
        }
    });

    // Add next/previous surah functionality
    const prevBtn = panel.querySelector('#quran-prev');
    const nextBtn = panel.querySelector('#quran-next');
    
    prevBtn.addEventListener('click', async () => {
        const currentSurah = parseInt(String(surahInput.value || '1'), 10);
        if (currentSurah > 1) {
            surahInput.value = String(currentSurah - 1);
            try {
                await loadAndPlay();
            } catch (e) {
                console.warn('Previous surah failed:', e);
                setStatus('Could not load previous surah');
            }
        } else {
            setStatus('Already at first surah');
        }
    });

    nextBtn.addEventListener('click', async () => {
        const currentSurah = parseInt(String(surahInput.value || '1'), 10);
        if (currentSurah < 114) {
            surahInput.value = String(currentSurah + 1);
            try {
                await loadAndPlay();
            } catch (e) {
                console.warn('Next surah failed:', e);
                setStatus('Could not load next surah');
            }
        } else {
            setStatus('Already at last surah');
        }
    });

    stopBtn.addEventListener('click', ()=>{ audio.pause(); audio.currentTime = 0; playing = false; playBtn.textContent = '▶️'; setStatus('Stopped'); });
    closeBtn.addEventListener('click', ()=>{ updatePanelVisibility(false); });
    // (no proxy UI handlers)

    // Toggle panel when button clicked
    btn.addEventListener('click', (e)=>{
        // If dragging, ignore click
        if (btn._isDragging) { btn._isDragging = false; return; }
        const isShown = panel.style.display !== 'none';
        updatePanelVisibility(!isShown);
    });

    // Draggable
    let dragging = false, startX=0, startY=0, origX=0, origY=0;
    const pos = loadPos();
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        // Clamp saved position to the current viewport so the button is not off-screen on small devices
        // Defer to next frame so btn.offsetWidth/offsetHeight are available
        requestAnimationFrame(() => {
            const bw = btn.offsetWidth || 56;
            const bh = btn.offsetHeight || 56;
            const maxX = Math.max(8, window.innerWidth - bw - 8);
            const maxY = Math.max(8, window.innerHeight - bh - 8);
            const clampedX = Math.min(Math.max(8, pos.x), maxX);
            const clampedY = Math.min(Math.max(8, pos.y), maxY);
            btn.style.right = 'auto'; btn.style.left = clampedX + 'px'; btn.style.top = clampedY + 'px'; btn.style.bottom = 'auto';
            // Save back the clamped pos to avoid future off-screen placements
            savePos({ x: clampedX, y: clampedY });
        });
    }

    function onPointerDown(e){
        dragging = true; btn._isDragging = false; startX = e.clientX; startY = e.clientY;
        origX = btn.getBoundingClientRect().left; origY = btn.getBoundingClientRect().top;
        btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e){ if (!dragging) return; btn._isDragging = true; const dx = e.clientX - startX; const dy = e.clientY - startY; let nx = origX + dx; let ny = origY + dy; nx = Math.max(8, Math.min(window.innerWidth - btn.offsetWidth - 8, nx)); ny = Math.max(8, Math.min(window.innerHeight - btn.offsetHeight - 8, ny)); btn.style.left = nx + 'px'; btn.style.top = ny + 'px'; btn.style.right = 'auto'; btn.style.bottom = 'auto'; }
    function onPointerUp(e){ if (!dragging) return; dragging = false; savePos({ x: parseInt(btn.style.left,10), y: parseInt(btn.style.top,10) }); setTimeout(()=>{ btn._isDragging = false; }, 50); }
    btn.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // initialize panel visibility from saved state
    const st = loadState(); if (st && st.visible) updatePanelVisibility(true);

    // Visibility watchdog: if the button is not visible (covered/hidden/off-canvas), retry anchoring it to bottom-right a few times.
    function isElementVisible(el) {
        try {
            const style = getComputedStyle(el);
            if (!el.offsetParent && style.position !== 'fixed') return false; // hidden via display:none or similar
            if (style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.05) return false;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return false;
            return true;
        } catch (e) { return false; }
    }

    (function startWatchdog(){
        let attempts = 0; const maxAttempts = 8; const iid = setInterval(() => {
            attempts++;
            if (isElementVisible(btn)) { clearInterval(iid); return; }
            // force anchor to bottom-right for mobile
            try {
                btn.style.right = window.innerWidth <= 480 ? '14px' : '20px';
                btn.style.left = 'auto';
                btn.style.bottom = window.innerWidth <= 480 ? '100px' : '80px';
                btn.style.top = 'auto';
                btn.style.display = 'flex'; btn.style.visibility = 'visible'; btn.style.opacity = '1';
                btn.style.zIndex = '999999';
                // ensure it's appended to body so it's not trapped inside transformed containers
                if (!document.body.contains(btn)) {
                    try { document.body.appendChild(btn); } catch (e) { try { document.documentElement.appendChild(btn); } catch(e){} }
                }
            } catch (e) {
                // ignore
            }
            if (attempts >= maxAttempts) clearInterval(iid);
        }, 500);
    })();

    // expose for debugging
    window.quranPlayer = { open: ()=>updatePanelVisibility(true), close: ()=>updatePanelVisibility(false) };
}

// Auto init based on user preferences
function autoInit() {
    try {
        const userPrefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
        if (userPrefs.quranPlayerEnabled) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    try {
                        init();
                    } catch (e) {
                        console.warn('Failed to initialize Quran Player:', e);
                    }
                });
            } else {
                init();
            }
        } else {
            // If the player is already initialized, remove it
            const existingBtn = document.querySelector('#quran-player-button');
            const existingPanel = document.querySelector('#quran-player-panel');
            if (existingBtn) existingBtn.remove();
            if (existingPanel) existingPanel.remove();
            try { delete window.__quranPlayerInited; } catch(e){}
        }
    } catch (e) {
        console.warn('Error checking Quran Player preferences:', e);
    }
}

// Run auto-init and expose init function globally
autoInit();

// Make init function available globally for direct calls
window.quranPlayer = {
    init: () => {
        try {
            init();
            return true;
        } catch (e) {
            console.warn('Failed to initialize Quran Player:', e);
            return false;
        }
    },
    isEnabled: () => {
        try {
            const userPrefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
            return !!userPrefs.quranPlayerEnabled;
        } catch (e) {
            return false;
        }
    }
};

export default window.quranPlayer;
