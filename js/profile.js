// profile.js

import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import Theme from './theme.js';
import { showLoader, hideLoader } from './loader.js';

// Cloudinary config (matches admin.js)
const CLOUD_NAME = "dqiwsls5y";
const UPLOAD_PRESET = "crackthefinal";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const CLOUDINARY_DELETE_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/delete_by_token`;

document.addEventListener('DOMContentLoaded', () => {
    // Get elements from the page
    const usernameHeader = document.getElementById('username-header');
    const avatarHeader = document.getElementById('avatar-header');
    const profileAvatar = document.getElementById('profile-avatar');
    const profileUsername = document.getElementById('profile-username');
    const profileEmail = document.getElementById('profile-email');
    const adminPanelButton = document.getElementById('admin-panel-button');
    const signOutButton = document.getElementById('sign-out-button');
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
                
                // Update header
                usernameHeader.textContent = userData.username;
                avatarHeader.innerHTML = `<img src="${userData.avatar}" alt="User Avatar" class="w-10 h-10 rounded-full object-cover">`;

                // Update profile card
                profileUsername.textContent = userData.username;
                profileEmail.textContent = userData.email;
                // profileAvatar may be an <a> (link to home) or a div - update its inner content accordingly
                profileAvatar.innerHTML = `<img id="profile-avatar-img" src="${userData.avatar}" alt="User Avatar" class="w-24 h-24 rounded-full object-cover">`;

                // wire avatar change flow
                const changeAvatarBtn = document.getElementById('change-avatar-btn');
                const avatarFileInput = document.getElementById('avatar-file-input');
                // change-avatar should still trigger the file input even if profileAvatar is a link
                if (changeAvatarBtn) changeAvatarBtn.addEventListener('click', (ev) => { ev.preventDefault(); avatarFileInput.click(); });

                

                avatarFileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const progressWrap = document.getElementById('avatar-upload-progress');
                    const progressBar = document.getElementById('avatar-upload-progress-bar');
                    const progressText = document.getElementById('avatar-upload-progress-text');
                    progressWrap.classList.remove('hidden');
                    progressBar.style.width = '0%';
                    progressText.textContent = '0%';

                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', CLOUDINARY_UPLOAD_URL);
                    xhr.upload.onprogress = (evt) => {
                        if (!evt.lengthComputable) return;
                        const pct = Math.round((evt.loaded / evt.total) * 100);
                        progressBar.style.width = pct + '%';
                        progressText.textContent = pct + '%';
                    };
                    xhr.onload = async () => {
                        try {
                            if (xhr.status < 200 || xhr.status >= 300) throw new Error('Upload failed');
                            const data = JSON.parse(xhr.responseText);
                            if (data.error) throw new Error(data.error.message || 'Cloudinary upload error');

                            const avatarUrl = data.secure_url;
                            const publicId = data.public_id || null;

                            // update user doc with new avatar public id
                            await updateDoc(userDocRef, { avatar: avatarUrl, avatarPublicId: publicId });

                            // update UI
                            const img = document.getElementById('profile-avatar-img');
                            if (img) img.src = avatarUrl;
                            document.getElementById('avatar-header').innerHTML = `<img src="${avatarUrl}" alt="User Avatar" class="w-10 h-10 rounded-full object-cover">`;
                        } catch (err) {
                            console.error('Error uploading avatar:', err);
                            alert('Error uploading avatar: ' + (err.message || err));
                        } finally {
                            setTimeout(() => progressWrap.classList.add('hidden'), 800);
                        }
                    };
                    xhr.onerror = () => {
                        alert('Upload failed.');
                        progressWrap.classList.add('hidden');
                    };
                    const publicIdForUser = `avatar_${user.uid}`;
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('upload_preset', UPLOAD_PRESET);
                    fd.append('public_id', publicIdForUser);
                    xhr.send(fd);
                });

                // delete avatar flow (overwrites existing public_id with tiny svg then clears fields)
                const deleteAvatarBtn = document.getElementById('delete-avatar-btn');
                if (userData.avatar) {
                    deleteAvatarBtn.classList.remove('hidden');
                } else {
                    deleteAvatarBtn.classList.add('hidden');
                }
                deleteAvatarBtn.addEventListener('click', async () => {
                    if (!confirm('Remove your photo and revert to initials?')) return;
                    try {
                        const publicIdToUse = userData.avatarPublicId || `avatar_${user.uid}`;
                        const tinySvg = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'></svg>`;
                        const blob = new Blob([tinySvg], { type: 'image/svg+xml' });
                        const fd2 = new FormData();
                        fd2.append('file', blob);
                        fd2.append('upload_preset', UPLOAD_PRESET);
                        fd2.append('public_id', publicIdToUse);

                        await new Promise((resolve, reject) => {
                            const r = new XMLHttpRequest();
                            r.open('POST', CLOUDINARY_UPLOAD_URL);
                            r.onload = () => {
                                if (r.status >= 200 && r.status < 300) resolve(r.responseText);
                                else reject(new Error('Failed to overwrite avatar'));
                            };
                            r.onerror = () => reject(new Error('Network error'));
                            r.send(fd2);
                        });

                        await updateDoc(userDocRef, { avatar: null, avatarPublicId: null });
                        const initial = (userData.username || 'U').charAt(0).toUpperCase();
                        profileAvatar.innerHTML = `<div class="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center text-2xl font-bold text-slate-600">${initial}</div>`;
                        avatarHeader.innerHTML = `<div class="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">${initial}</div>`;
                        deleteAvatarBtn.classList.add('hidden');
                    } catch (err) {
                        console.error('Error removing avatar:', err);
                        alert('Could not remove avatar.');
                    }
                });

                // username edit
                const editUsernameBtn = document.getElementById('edit-username-btn');
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

                // IMPORTANT: Show admin button only if user is an admin
                if (userData.isAdmin === true) {
                    adminPanelButton.classList.remove('hidden');
                }

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

        attemptsListEl.innerHTML = '<p class="text-gray-500">Loading attempts...</p>';
        try {
            const attemptsQuery = query(collection(db, 'users', uid, 'attempts'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(attemptsQuery);
            if (snap.empty) {
                attemptsListEl.innerHTML = '<p class="text-gray-500">No attempts yet.</p>';
                totalAttemptsEl.textContent = '0';
                totalPointsEl.textContent = '0';
                avgPercentEl.textContent = '0%';
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

            // compute analytics
            const totalAttempts = attempts.length;
            const totalPoints = attempts.reduce((s, a) => s + (a.totalPoints || 0), 0);
            const avgPercent = Math.round((attempts.reduce((s, a) => s + (a.percent || 0), 0) / totalAttempts) || 0);

            totalAttemptsEl.textContent = String(totalAttempts);
            totalPointsEl.textContent = String(totalPoints);
            avgPercentEl.textContent = `${avgPercent}%`;

            // render attempts (fetch subject/quiz names as needed)
            attemptsListEl.innerHTML = '';
            for (const attempt of attempts) {
                const subjName = await fetchSubjectName(attempt.subjectId);
                const quizName = await fetchQuizName(attempt.subjectId, attempt.quizId);

                const item = document.createElement('div');
                item.className = 'p-3 bg-white rounded-lg shadow-sm flex items-center justify-between';
                item.innerHTML = `
                    <div>
                        <div class="font-semibold">${quizName}</div>
                        <div class="text-sm text-gray-500">Subject: ${subjName}</div>
                        <div class="text-sm text-gray-500">Score: ${attempt.totalPoints} / ${attempt.maxPoints} — ${attempt.percent}%</div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button data-attempt-id="${attempt.id}" class="preview-attempt-btn bg-blue-50 text-blue-600 px-3 py-1 rounded">Preview</button>
                        <div class="text-xs text-gray-400">${attempt.createdAt?.toDate ? attempt.createdAt.toDate().toLocaleString() : ''}</div>
                    </div>
                `;
                attemptsListEl.appendChild(item);
            }

            // wire preview buttons
            document.querySelectorAll('.preview-attempt-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.getAttribute('data-attempt-id');
                    const attempt = attempts.find(a => a.id === id);
                    if (attempt) showAttemptModal(attempt);
                });
            });
            hideLoader();
        } catch (err) {
            console.error('Error fetching attempts:', err);
            attemptsListEl.innerHTML = '<p class="text-red-500">Error loading attempts.</p>';
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
                    row.className = 'p-3 border-b';

                    const qTitle = document.createElement('div');
                    qTitle.className = 'font-semibold mb-2';
                    qTitle.textContent = `${i+1}. ${d.text || 'Question'}`;
                    row.appendChild(qTitle);

                    // options list
                    if (Array.isArray(d.options)) {
                        d.options.forEach((opt, oi) => {
                            const optRow = document.createElement('div');
                            optRow.className = 'flex items-center gap-3 py-1';

                            const mark = document.createElement('div');
                            mark.className = 'w-5 h-5 rounded-full flex items-center justify-center';
                            if (oi === d.correctIndex) {
                                mark.style.background = '#10b981';
                                mark.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8z" clip-rule="evenodd"/></svg>';
                            } else if (oi === d.userAnswer) {
                                mark.style.background = (d.userAnswer === d.correctIndex) ? '#10b981' : '#ef4444';
                                mark.innerHTML = d.userAnswer === d.correctIndex ? '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8z" clip-rule="evenodd"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6.293 6.293a1 1 0 011.414 0L10 8.586l2.293-2.293a1 1 0 111.414 1.414L11.414 10l2.293 2.293a1 1 0 01-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 01-1.414-1.414L8.586 10 6.293 7.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
                            } else {
                                mark.style.border = '1px solid #e5e7eb';
                            }

                            const label = document.createElement('div');
                            label.textContent = opt;

                            optRow.appendChild(mark);
                            optRow.appendChild(label);
                            row.appendChild(optRow);
                        });
                    }

                    const pointsRow = document.createElement('div');
                    pointsRow.className = 'mt-2 text-sm text-gray-600';
                    pointsRow.textContent = `Points: ${d.points} `;
                    row.appendChild(pointsRow);

                    body.appendChild(row);
                });
            } else {
                body.innerHTML = '<p class="text-gray-500">No details available for this attempt.</p>';
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

    // Auth State Checker (Route Guard)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, fetch their data
            fetchAndDisplayUserData(user);
        } else {
            // User is not signed in, redirect them to the auth page
            window.location.href = '/index.html';
        }
    });

    // Sign Out Button functionality
    signOutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("User signed out successfully.");
            // Redirect to auth page after sign out
            window.location.href = '/index.html';
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });
});