// profile.js

import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import Theme from './theme.js';
import { showLoader, hideLoader } from './loader.js';

// Generate SVG avatar for a username
function generateAvatarSvg(username) {
    const getInitials = (name) => {
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name[0].toUpperCase();
    };

    // Generate a consistent color based on username
    const colors = [
        '#d946ef', // Default purple from example
        '#ec4899', // pink
        '#3b82f6', // blue
        '#14b8a6', // teal
        '#f59e0b', // amber
        '#84cc16', // lime
        '#6366f1'  // indigo
    ];
    const colorIndex = Math.abs(username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
    const bgColor = colors[colorIndex];
    
    const initials = getInitials(username);
    const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="${bgColor}" /><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" fill="#ffffff">${initials}</text></svg>`;
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // Get elements from the page
    const usernameHeader = document.getElementById('username-header');
    const avatarHeader = document.getElementById('avatar-header');
    const profileAvatar = document.getElementById('profile-avatar');
    const profileUsername = document.getElementById('profile-username');
    const profileEmail = document.getElementById('profile-email');
    const adminPanelButton = document.getElementById('admin-panel-button');
    const signOutButton = document.getElementById('sign-out-button');
    const totalAttemptsEl = document.getElementById('total-attempts');
    const totalPointsEl = document.getElementById('total-points');
    const avgPercentEl = document.getElementById('average-percent');
    const attemptsListEl = document.getElementById('attempts-list');
    const attemptsTrendEl = document.getElementById('attempts-trend');
    const pointsTrendEl = document.getElementById('points-trend');
    const scoreTrendEl = document.getElementById('score-trend');
    const streakCountEl = document.getElementById('streak-count');
    const streakProgressEl = document.getElementById('streak-progress');
    const subjectsCompletedEl = document.getElementById('subjects-completed');
    const subjectsProgressEl = document.getElementById('subjects-progress');
    const performanceGraphEl = document.getElementById('performance-graph');
    // Theme controls (delegates to js/theme.js)
    const initThemeControls = () => {
        const saved = Theme.initTheme();
        const radios = Array.from(document.querySelectorAll('input[name="theme-choice"]'));
        radios.forEach(r => r.checked = (r.value === saved));
        document.addEventListener('change', (e) => {
            if (e.target && e.target.name === 'theme-choice') {
                Theme.setTheme(e.target.value);
            }
        });
        // respond to system changes when in 'system' mode
        Theme.initThemeListener(() => {
            // re-sync radios (will be 'system')
            radios.forEach(r => r.checked = (r.value === 'system'));
        });
    };

    initThemeControls();

    // Quran Player removed

    // ----- Chart helpers (rendering performance & subject breakdown) -----
    // Dynamically load a script by src
    function loadScript(src) {
        return new Promise((res, rej) => {
            if (document.querySelector(`script[src="${src}"]`)) return res();
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => res();
            s.onerror = (e) => rej(e);
            document.head.appendChild(s);
        });
    }

    function getColorPair() {
        const dark = document.documentElement.classList.contains('dark');
        if (dark) {
            return { text: '#E5E7EB', grid: '#374151', primary: '#60A5FA', secondary: '#FBBF24' };
        }
        return { text: '#1F2937', grid: '#E5E7EB', primary: '#3B82F6', secondary: '#F59E0B' };
    }

    let performanceChart = null;
    let subjectsChart = null;

    function renderCharts(attempts, subjectsMap) {
        // attempts: array of {percent, createdAt, subjectId}
        // subjectsMap: Map subjectId -> name
        loadScript('https://cdn.jsdelivr.net/npm/chart.js').then(() => {
            const colors = getColorPair();

            // Performance chart (last 30 attempts)
            const recent = attempts.slice(-30);
            const labels = recent.map((a, i) => `${i + 1}`);
            const data = recent.map(a => Math.round((a.percent || 0) * 100) / 100);

            const perfEl = document.getElementById('performance-chart');
            if (perfEl) {
                const perfCtx = perfEl.getContext('2d');
                if (performanceChart) performanceChart.destroy();
                performanceChart = new Chart(perfCtx, {
                    type: 'line',
                    data: { labels, datasets: [{ label: 'Score %', data, fill: true, backgroundColor: colors.primary + '33', borderColor: colors.primary, pointRadius: 3, tension: 0.25 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: colors.grid }, ticks: { color: colors.text } }, y: { min: 0, max: 100, grid: { color: colors.grid }, ticks: { color: colors.text } } } }
                });
            }

            // Subjects chart: average percent per subject (top 8 by attempts)
            const bySubject = {};
            attempts.forEach(a => {
                const id = a.subjectId || 'unknown';
                if (!bySubject[id]) bySubject[id] = { total: 0, count: 0 };
                bySubject[id].total += (a.percent || 0);
                bySubject[id].count += 1;
            });

            const entries = Object.entries(bySubject).map(([id, v]) => ({ id, avg: v.count ? (v.total / v.count) : 0, count: v.count, name: subjectsMap.get(id) || id }));
            entries.sort((a, b) => b.count - a.count);
            const top = entries.slice(0, 8);

            const subjEl = document.getElementById('subjects-chart');
            if (subjEl) {
                const subjCtx = subjEl.getContext('2d');
                if (subjectsChart) subjectsChart.destroy();
                subjectsChart = new Chart(subjCtx, {
                    type: 'bar',
                    data: { labels: top.map(t => t.name), datasets: [{ label: 'Avg %', data: top.map(t => Math.round(t.avg * 100) / 100), backgroundColor: top.map((_, i) => i % 2 === 0 ? colors.primary : colors.secondary) }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: colors.grid }, ticks: { color: colors.text } }, y: { min: 0, max: 100, grid: { color: colors.grid }, ticks: { color: colors.text } } } }
                });
            }
        }).catch(err => console.warn('Failed to load Chart.js', err));
    }

    /**
     * Fetches user data from Firestore and updates all relevant UI elements.
     * @param {object} user - The Firebase Auth user object.
     */
    const fetchAndDisplayUserData = async (user) => {
        showLoader('Loading profile...');
        const userDocRef = doc(db, 'users', user.uid);
        try {
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // Update header and profile info
                usernameHeader.textContent = userData.username;
                profileUsername.textContent = userData.username;
                profileEmail.textContent = userData.email;

                // Use existing avatar or generate new one
                const avatarSvg = userData.avatar || generateAvatarSvg(userData.username);
                
                // If avatar doesn't exist, save the generated one
                if (!userData.avatar) {
                    updateDoc(userDocRef, { avatar: avatarSvg }).catch(console.error);
                }
                
                // Update avatar displays
                const avatarImg = `<img src="${avatarSvg}" alt="${userData.username}'s avatar" class="w-full h-full rounded-full">`;
                
                // avatarHeader on this page is now a text 'Return to Home' span; only overwrite if it's a container div
                try {
                    if (avatarHeader && avatarHeader.tagName && avatarHeader.tagName.toLowerCase() !== 'span') {
                        avatarHeader.innerHTML = `<div class="w-10 h-10">${avatarImg}</div>`;
                    }
                } catch (e) { /* ignore DOM update if avatarHeader is not present */ }

                // profileAvatar may be an <a> (link to home) or a div - update its inner content accordingly
                profileAvatar.innerHTML = `<div class="w-24 h-24">${avatarImg}</div>`;

                

                // Letter avatars are generated from username, no upload/delete needed

                // username edit
                const editUsernameBtn = document.getElementById('edit-username-btn');
                if (editUsernameBtn) {
                    editUsernameBtn.addEventListener('click', async () => {
                    const newName = prompt('Enter new username', userData.username || '');
                    if (!newName || newName.trim().length < 2) return;
                    try {
                        await updateDoc(userDocRef, { username: newName.trim() });
                        usernameHeader.textContent = newName.trim();
                        profileUsername.textContent = newName.trim();
                    } catch (err) {
                        console.error('Error updating username:', err);
                        alert('Could not update username.');
                    }
                });
                }  // Close the editUsernameBtn check

                // IMPORTANT: Show admin button only if user is an admin
                const adminPanelButton = document.getElementById('admin-panel-button');
                if (adminPanelButton) {
                    // Accept boolean true or string 'true' (in case Firestore stores it as a string)
                    const isAdmin = (userData.isAdmin === true) || (String(userData.isAdmin).toLowerCase() === 'true');
                    if (isAdmin) {
                        // Make the admin button visible and interactive
                        adminPanelButton.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
                        adminPanelButton.classList.add('opacity-100');
                        adminPanelButton.setAttribute('data-visible', 'true');
                    } else {
                        // Ensure hidden for non-admins (fully hide and remove interaction)
                        adminPanelButton.classList.add('opacity-0', 'pointer-events-none', 'hidden');
                        adminPanelButton.classList.remove('opacity-100');
                        adminPanelButton.removeAttribute('data-visible');
                    }
                }

                // Notifications feature temporarily removed

                // fetch attempts and render analytics
                fetchAndRenderAttempts(user.uid);

            } else {
                console.error("No user data found in Firestore!");
                // Handle case where user exists in Auth but not in Firestore
                profileUsername.textContent = "User data not found";
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
        } finally {
            hideLoader();
        }
    };

    const fetchAndRenderAttempts = async (uid) => {
        showLoader('Loading attempts...');
        const attemptsListEl = document.getElementById('attempts-list');
        const totalAttemptsEl = document.getElementById('total-attempts');
        const totalPointsEl = document.getElementById('total-points');
        const avgPercentEl = document.getElementById('average-percent');
        const attemptsTrendEl_local = document.getElementById('attempts-trend');
        const pointsTrendEl_local = document.getElementById('points-trend');
        const scoreTrendEl_local = document.getElementById('score-trend');
        const streakCountEl_local = document.getElementById('streak-count');
        const streakProgressEl_local = document.getElementById('streak-progress');
        const subjectsCompletedEl_local = document.getElementById('subjects-completed');
        const subjectsProgressEl_local = document.getElementById('subjects-progress');
        const performanceGraphEl_local = document.getElementById('performance-graph');
        const allSubjects = new Set(); // Initialize allSubjects here

        if (attemptsListEl) {
            attemptsListEl.innerHTML = '<p class="text-gray-500">Loading attempts...</p>';
        } else {
            console.warn('profile.js: attempts-list element not found in DOM; skipping attempts render.');
        }
        // Guard: only attempt to read the attempts collection if the currently authenticated user
        // matches the uid requested. This avoids permission-denied errors when auth state is out
        // of sync or the page is loaded for a different user id.
        if (!auth.currentUser || auth.currentUser.uid !== uid) {
            if (attemptsListEl) attemptsListEl.innerHTML = '<p class="text-gray-500">Sign in to view your attempts.</p>';
            hideLoader();
            return;
        }
        try {
            const attemptsQuery = query(collection(db, 'users', uid, 'attempts'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(attemptsQuery);
            if (snap.empty) {
                if (attemptsListEl) attemptsListEl.innerHTML = '<p class="text-gray-500">No attempts yet.</p>';
                if (totalAttemptsEl) totalAttemptsEl.textContent = '0';
                if (totalPointsEl) totalPointsEl.textContent = '0';
                if (avgPercentEl) avgPercentEl.textContent = '0%';
                hideLoader();
                return;
            }

            const attempts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // caches to avoid repeated reads
            const subjectNameCache = new Map();
            const quizNameCache = new Map();

            const fetchSubjectName = async (subjectId) => {
                if (!subjectId) return 'Unknown subject';
                if (subjectNameCache.has(subjectId)) return subjectNameCache.get(subjectId);
                try {
                    const sDoc = await getDoc(doc(db, 'subjects', subjectId));
                    const name = sDoc.exists() ? (sDoc.data().name || subjectId) : subjectId;
                    subjectNameCache.set(subjectId, name);
                    allSubjects.add(subjectId); // Add to tracked subjects
                    return name;
                } catch (e) {
                    console.error('Error fetching subject name:', e);
                    return subjectId;
                }
            };

            const fetchQuizName = async (subjectId, quizId) => {
                if (!subjectId || !quizId) return 'Unknown quiz';
                const key = `${subjectId}/${quizId}`;
                if (quizNameCache.has(key)) return quizNameCache.get(key);
                try {
                    const qDoc = await getDoc(doc(db, 'subjects', subjectId, 'quizzes', quizId));
                    const name = qDoc.exists() ? (qDoc.data().name || quizId) : quizId;
                    quizNameCache.set(key, name);
                    return name;
                } catch (e) {
                    console.error('Error fetching quiz name:', e);
                    return quizId;
                }
            };

            // Compute overall analytics
            const totalAttempts = attempts.length;
            // Build best-attempt-per-quiz map (keyed by subjectId/quizId)
            const bestByQuiz = new Map();
            attempts.forEach(a => {
                const key = `${a.subjectId || 'unknown'}/${a.quizId || 'unknown'}`;
                const pct = typeof a.percent === 'number' ? a.percent : (typeof a.percent === 'string' ? parseFloat(a.percent) || 0 : 0);
                const total = typeof a.totalPoints === 'number' ? a.totalPoints : (typeof a.points === 'number' ? a.points : 0);
                const max = (typeof a.maxPoints === 'number') ? a.maxPoints : (a.maxPoints ?? null);
                const existing = bestByQuiz.get(key);
                if (!existing || pct > existing.percent) {
                    bestByQuiz.set(key, { percent: Math.round(pct), totalPoints: total, maxPoints: max, createdAt: a.createdAt });
                }
            });

            // totalPoints now equals sum of best attempt totalPoints per quiz
            const totalPoints = Array.from(bestByQuiz.values()).reduce((s, b) => s + (b.totalPoints || 0), 0);
            // average percent based on best attempts per quiz
            const avgPercent = Math.round((Array.from(bestByQuiz.values()).reduce((s, b) => s + (b.percent || 0), 0) / Math.max(bestByQuiz.size, 1)) || 0);

            // Update basic stats
            if (totalAttemptsEl) totalAttemptsEl.textContent = String(totalAttempts);
            if (totalPointsEl) totalPointsEl.textContent = String(totalPoints);
            if (avgPercentEl) avgPercentEl.textContent = `${avgPercent}%`;

            // Compute trends
            const now = new Date();
            const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

            const thisWeekAttempts = attempts.filter(a => a.createdAt?.toDate() >= weekAgo).length;
            const thisMonthAttempts = attempts.filter(a => a.createdAt?.toDate() >= monthAgo);
            const lastMonthAttempts = attempts.filter(a => {
                const date = a.createdAt?.toDate();
                return date >= new Date(monthAgo - 30 * 24 * 60 * 60 * 1000) && date < monthAgo;
            });

            // Update trend indicators
            if (attemptsTrendEl_local) attemptsTrendEl_local.textContent = `+${thisWeekAttempts} this week`;
            if (pointsTrendEl_local) {
                try {
                    // Compute points gained this week as sum of improvements (best now - best before week)
                    const bestNow = new Map();
                    const bestBefore = new Map();
                    attempts.forEach(a => {
                        const key = `${a.subjectId || 'unknown'}/${a.quizId || 'unknown'}`;
                        const created = a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : null);
                        const pts = typeof a.totalPoints === 'number' ? a.totalPoints : (a.points ?? 0);
                        // best overall
                        const bn = bestNow.get(key);
                        if (!bn || pts > bn) bestNow.set(key, pts);
                        // best before weekAgo
                        if (created && created < weekAgo) {
                            const bb = bestBefore.get(key);
                            if (!bb || pts > bb) bestBefore.set(key, pts);
                        }
                    });
                    let weekGain = 0;
                    for (const [k, nowPts] of bestNow.entries()) {
                        const beforePts = bestBefore.get(k) || 0;
                        const delta = nowPts - beforePts;
                        if (delta > 0) weekGain += delta;
                    }
                    pointsTrendEl_local.textContent = `+${weekGain} this week`;
                } catch (e) {
                    pointsTrendEl_local.textContent = `+0 this week`;
                }
            }

            const thisMonthAvg = Math.round(thisMonthAttempts.reduce((s, a) => s + (a.percent || 0), 0) / thisMonthAttempts.length || 0);
            const lastMonthAvg = Math.round(lastMonthAttempts.reduce((s, a) => s + (a.percent || 0), 0) / lastMonthAttempts.length || 0);
            const scoreDiff = thisMonthAvg - lastMonthAvg;
            if (scoreTrendEl_local) scoreTrendEl_local.textContent = `${scoreDiff >= 0 ? '+' : ''}${scoreDiff}% vs last month`;

            // Compute streak
            let currentStreak = 0;
            let maxStreak = 0;
            let lastDate = null;
            
            for (const attempt of attempts) {
                const date = attempt.createdAt?.toDate();
                if (!date) continue;
                
                if (!lastDate || date.toDateString() === lastDate.toDateString()) {
                    currentStreak++;
                } else if (Math.abs(date - lastDate) <= 24 * 60 * 60 * 1000) {
                    currentStreak++;
                } else {
                    currentStreak = 1;
                }
                
                maxStreak = Math.max(maxStreak, currentStreak);
                lastDate = date;
            }

            // Update streak UI
            if (streakCountEl_local) streakCountEl_local.textContent = `${maxStreak} questions`;
            if (streakProgressEl_local) streakProgressEl_local.style.width = `${Math.min((maxStreak / 50) * 100, 100)}%`; // 50 questions as target

            // Subject coverage
            const attemptedSubjects = new Set(attempts.map(a => a.subjectId).filter(Boolean));
            // Add attempted subjects to tracked set
            for (const s of attemptedSubjects) allSubjects.add(s);
            if (subjectsCompletedEl_local) subjectsCompletedEl_local.textContent = `${attemptedSubjects.size}/${allSubjects.size} subjects`;
            if (subjectsProgressEl_local) subjectsProgressEl_local.style.width = `${Math.round((attemptedSubjects.size / Math.max(allSubjects.size, 1)) * 100)}%`;

            // Pre-fetch subject names used in charts/list so charts can show friendly names
            await Promise.all(Array.from(attemptedSubjects).map(id => fetchSubjectName(id)));

            // Render charts (performance over recent attempts and subject breakdown)
            try {
                renderCharts(attempts, subjectNameCache);
            } catch (e) {
                console.warn('Could not render charts', e);
            }

            // Performance graph (last 10 attempts)
            const graphData = attempts.slice(0, 10).map(a => a.percent || 0).reverse();
            if (graphData.length > 0 && performanceGraphEl_local) {
                performanceGraphEl_local.innerHTML = ''; // Clear placeholder
                performanceGraphEl_local.className = 'relative h-[60px] w-full bg-gray-50 dark:bg-gray-800/30 rounded-lg p-1 flex items-end justify-between gap-1';

                const maxHeight = 52; // Adjusted for padding
                graphData.forEach((score, i) => {
                    const bar = document.createElement('div');
                    const height = Math.max((score / 100) * maxHeight, 4);
                    bar.className = 'bg-blue-400 dark:bg-blue-500 rounded-t transition-all duration-300 w-full';
                    bar.style.height = `${height}px`;
                    bar.title = `${score}%`;

                    // Create tooltip
                    const tooltip = document.createElement('div');
                    tooltip.className = 'absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-2 py-1 rounded text-xs opacity-0 transition-opacity';
                    tooltip.textContent = `${score}%`;
                    bar.appendChild(tooltip);

                    // Add hover effect
                    bar.addEventListener('mouseenter', () => {
                        tooltip.classList.add('opacity-100');
                    });
                    bar.addEventListener('mouseleave', () => {
                        tooltip.classList.remove('opacity-100');
                    });

                    const barContainer = document.createElement('div');
                    barContainer.className = 'relative flex-1';
                    barContainer.appendChild(bar);
                    performanceGraphEl_local.appendChild(barContainer);
                });
            }

            // render attempts (fetch subject/quiz names as needed)
            // Group attempts by subject -> quiz
            const grouped = {}; // { subjectId: { name, quizzes: { quizId: { name, attempts: [] } } } }
            for (const attempt of attempts) {
                const sid = attempt.subjectId || 'unknown';
                const qid = attempt.quizId || 'unknown';
                if (!grouped[sid]) grouped[sid] = { name: await fetchSubjectName(sid), quizzes: {} };
                if (!grouped[sid].quizzes[qid]) grouped[sid].quizzes[qid] = { name: await fetchQuizName(sid, qid), attempts: [] };
                grouped[sid].quizzes[qid].attempts.push(attempt);
            }

            // Render accordions
            if (attemptsListEl) {
                attemptsListEl.innerHTML = '';
                for (const [sid, sdata] of Object.entries(grouped)) {
                    const subjectDetails = document.createElement('details');
                    subjectDetails.className = 'bg-white dark:bg-gray-800 rounded-lg p-3';

                    const subjSummary = document.createElement('summary');
                    subjSummary.className = 'cursor-pointer font-semibold flex items-center justify-between gap-4';
                    subjSummary.innerHTML = `<span class="flex items-center gap-3"><span class="ctf-arrow">` +
                        `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-gray-500 dark:text-gray-300">` +
                        `<path d="M6 4L14 10L6 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="text-lg">${sdata.name}</span></span><span class="text-sm text-gray-500 dark:text-gray-400">${Object.keys(sdata.quizzes).length} quizzes</span>`;
                    subjectDetails.appendChild(subjSummary);

                    const quizzesWrap = document.createElement('div');
                    quizzesWrap.className = 'mt-3 space-y-2';

                    for (const [qid, qdata] of Object.entries(sdata.quizzes)) {
                        const quizDetails = document.createElement('details');
                        quizDetails.className = 'bg-gray-50 dark:bg-gray-900/30 rounded-md p-2';

                        const quizSummary = document.createElement('summary');
                        quizSummary.className = 'cursor-pointer flex items-center justify-between';
                        quizSummary.innerHTML = `<span class="flex items-center gap-3"><span class="ctf-arrow">` +
                            `<svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-gray-500 dark:text-gray-300">` +
                            `<path d="M6 4L14 10L6 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="font-medium">${qdata.name}</span></span><span class="text-sm text-gray-500 dark:text-gray-400">${qdata.attempts.length} attempts</span>`;
                        quizDetails.appendChild(quizSummary);

                        const attemptsWrap = document.createElement('div');
                        attemptsWrap.className = 'mt-2 space-y-2';

                        for (const attempt of qdata.attempts) {
                            const aRow = document.createElement('div');
                            aRow.className = 'p-2 bg-white dark:bg-gray-800 rounded-md flex items-center justify-between shadow-sm';
                            aRow.innerHTML = `
                                <div>
                                    <div class="text-sm dark:text-white font-medium">Score: ${attempt.totalPoints} / ${attempt.maxPoints} — ${attempt.percent}%</div>
                                    <div class="text-xs text-gray-500 dark:text-gray-400">${attempt.createdAt?.toDate ? attempt.createdAt.toDate().toLocaleString() : ''}</div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button data-attempt-id="${attempt.id}" aria-label="Open attempt preview" class="preview-attempt-btn bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-4 py-2 rounded hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors">Preview</button>
                                </div>
                            `;
                            attemptsWrap.appendChild(aRow);
                        }

                        quizDetails.appendChild(attemptsWrap);
                        quizzesWrap.appendChild(quizDetails);
                    }

                    subjectDetails.appendChild(quizzesWrap);
                    attemptsListEl.appendChild(subjectDetails);
                }
            }

            // wire preview buttons
            document.querySelectorAll('.preview-attempt-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.getAttribute('data-attempt-id');
                    // Find attempt by id in the original attempts array
                    const attempt = attempts.find(a => a.id === id);
                    if (attempt) showAttemptModal(attempt);
                });
            });
            hideLoader();
        } catch (err) {
            // Handle permission-denied more gracefully (common when Firestore rules restrict access)
            const msg = (err && err.code) ? err.code : (err && err.message ? err.message : String(err));
            if (msg === 'permission-denied' || (typeof msg === 'string' && msg.toLowerCase().includes('missing or insufficient permissions'))) {
                // Don't print the full FirebaseError object to the console to avoid noisy stacks in the UI console.
                console.warn('Permission denied when fetching attempts.');
                if (attemptsListEl) attemptsListEl.innerHTML = `<p class="text-yellow-600">You don't have permission to view attempts. Please sign in with the account that owns these attempts, or contact support.</p>`;
            } else {
                console.error('Error fetching attempts:', err);
                if (attemptsListEl) attemptsListEl.innerHTML = '<p class="text-red-500">Error loading attempts.</p>';
            }
            hideLoader();
        }
    };

    const showAttemptModal = (attempt) => {
        const modal = document.getElementById('attempt-modal');
        const body = document.getElementById('attempt-modal-body');
        body.innerHTML = '';
            if (attempt.details && Array.isArray(attempt.details)) {
                attempt.details.forEach((d, i) => {
                    const row = document.createElement('div');
                    row.className = 'p-3 border-b dark:border-gray-700';

                    const qTitle = document.createElement('div');
                    qTitle.className = 'font-semibold mb-2 dark:text-white';
                    qTitle.textContent = `${i+1}. ${d.text || 'Question'}`;
                    row.appendChild(qTitle);


                    // options list - robust to different attempt.detail shapes
                    const options = Array.isArray(d.options) ? d.options : (Array.isArray(d.opts) ? d.opts : []);
                    const correctIndex = (typeof d.correctIndex !== 'undefined') ? d.correctIndex : (typeof d.correct === 'number' ? d.correct : null);
                    const userAnswer = (typeof d.userAnswer !== 'undefined') ? d.userAnswer : (typeof d.userSelected === 'number' ? d.userSelected : null);

                    if (options.length > 0) {
                        options.forEach((opt, oi) => {
                            const optRow = document.createElement('div');
                            optRow.className = 'flex items-center gap-3 py-1';

                            const mark = document.createElement('div');
                            mark.className = 'w-5 h-5 rounded-full flex items-center justify-center';
                            // correct answer
                            if (oi === correctIndex) {
                                mark.classList.add('ctf-mark-correct');
                                mark.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8z" clip-rule="evenodd"/></svg>';
                            } else if (oi === userAnswer) {
                                // user's chosen answer: show green if correct, red if wrong
                                if (userAnswer === correctIndex) {
                                    mark.classList.add('ctf-mark-correct');
                                    mark.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8z" clip-rule="evenodd"/></svg>';
                                } else {
                                    mark.classList.add('ctf-mark-wrong');
                                    mark.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6.293 6.293a1 1 0 011.414 0L10 8.586l2.293-2.293a1 1 0 111.414 1.414L11.414 10l2.293 2.293a1 1 0 01-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 01-1.414-1.414L8.586 10 6.293 7.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
                                }
                            } else {
                                mark.classList.add('ctf-mark-neutral');
                            }

                            const label = document.createElement('div');
                            label.textContent = opt;

                            optRow.appendChild(mark);
                            optRow.appendChild(label);
                            row.appendChild(optRow);
                        });
                    }

                    // points: support multiple field names (points, earnedPoints, basePoints)
                    const pointsVal = (typeof d.points !== 'undefined') ? d.points : ((typeof d.earnedPoints !== 'undefined') ? d.earnedPoints : ((typeof d.basePoints !== 'undefined') ? d.basePoints : 0));
                    const maxVal = (typeof d.maxPoints !== 'undefined') ? d.maxPoints : ((typeof d.basePoints !== 'undefined') ? d.basePoints : 0);
                    const pointsRow = document.createElement('div');
                    pointsRow.className = 'mt-2 text-sm text-gray-600 ctf-points';
                    pointsRow.textContent = `Points: ${pointsVal} ${maxVal ? `/ ${maxVal}` : ''}`;
                    row.appendChild(pointsRow);

                    body.appendChild(row);
                });
            } else {
                body.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No details available for this attempt.</p>';
            }
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    };

    const closeAttemptModal = () => {
        const modal = document.getElementById('attempt-modal');
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    };

    document.getElementById('attempt-modal-close').addEventListener('click', closeAttemptModal);

    // Expand/Collapse all controls
    const expandAllBtn = document.getElementById('expand-all-btn');
    const collapseAllBtn = document.getElementById('collapse-all-btn');
    function setAllDetails(open) {
        const container = document.getElementById('attempts-list');
        if (!container) return;
        const details = container.querySelectorAll('details');
        details.forEach(d => {
            if (open) d.setAttribute('open', ''); else d.removeAttribute('open');
        });
    }
    if (expandAllBtn) expandAllBtn.addEventListener('click', () => setAllDetails(true));
    if (collapseAllBtn) collapseAllBtn.addEventListener('click', () => setAllDetails(false));

    // Auth State Checker (Route Guard)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, fetch their data
            fetchAndDisplayUserData(user);
        } else {
            // User is not signed in, redirect them to the auth page
            window.location.href = '/auth.html';
        }
    });

    // Sign Out Button functionality
    signOutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("User signed out successfully.");
            // Redirect to auth page after sign out
            window.location.href = '/auth.html';
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });
});