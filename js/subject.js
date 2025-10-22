// subject.js

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { showLoader, hideLoader } from './loader.js';

document.addEventListener('DOMContentLoaded', () => {

    const urlParams = new URLSearchParams(window.location.search);
    const subjectId = urlParams.get('id');

    if (!subjectId) {
        document.body.innerHTML = '<h1>Error: Subject ID is missing.</h1>';
        return;
    }

    const largeCoverEl = document.getElementById('subject-large-cover');
    const quizzesListEl = document.getElementById('quizzes-list');
    const subscribeBell = document.getElementById('subscribe-bell');
    
    // ADDED: Get header elements
    const usernameHeader = document.getElementById('username-header');
    const avatarHeader = document.getElementById('avatar-header');


    /**
     * ADDED: Fetches user data for the header
     */
    const fetchAndDisplayUserData = async (user) => {
        const userDocRef = doc(db, 'users', user.uid);
        try {
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const userData = userDoc.data();
                // Only show the username text on medium+ screens; on small screens keep avatar-only
                // Only update username if the element exists (we removed it from HTML)
                const mdMq = window.matchMedia('(min-width: 768px)');
                const syncUsernameVisibility = () => {
                    if (usernameHeader) {
                        if (mdMq.matches) {
                            usernameHeader.textContent = userData.username;
                            usernameHeader.classList.remove('hidden');
                        } else {
                            usernameHeader.classList.add('hidden');
                        }
                    }
                };
                syncUsernameVisibility();
                // listen for viewport changes so header updates responsively
                if (mdMq.addEventListener) mdMq.addEventListener('change', syncUsernameVisibility); else mdMq.addListener(syncUsernameVisibility);
                if (avatarHeader) avatarHeader.innerHTML = `<img src="${userData.avatar}" alt="User Avatar" class="w-10 h-10 rounded-full object-cover">`;
            }
        } catch (error) {
            console.error("Error fetching user data for header:", error);
        }
    };

    // Subscription/notification UI removed for now.


    const displaySubjectDetails = async (user = null) => {
        showLoader('Loading subject...');
        const subjectDocRef = doc(db, 'subjects', subjectId);
        let subjectDoc;
        try {
            subjectDoc = await getDoc(subjectDocRef);
        } catch (err) {
            // If reading subject doc is forbidden for anonymous users, surface a friendly message below
            console.warn('Could not read subject document (possibly permission issue):', err);
            hideLoader();
            if (quizzesListEl) {
                quizzesListEl.innerHTML = `
                    <div class="p-4 bg-yellow-50 rounded-lg text-center border border-yellow-100">
                        <p class="mb-3 text-gray-700">Please sign in to view this subject's content and quizzes.</p>
                        <a href="/auth.html" class="inline-block px-4 py-2 bg-yellow-500 text-white rounded">Sign in to access</a>
                    </div>
                `;
            }
            return;
        }

        if (subjectDoc && subjectDoc.exists()) {
            const subjectData = subjectDoc.data();
            largeCoverEl.src = subjectData.largeCoverUrl;
            largeCoverEl.alt = subjectData.name;
            // The H1 element for the subject name has been removed from HTML
        } else {
            document.body.innerHTML = '<h1>Error: Subject Not Found.</h1>';
            return;
        }

        // Only attempt to read quizzes if user is provided (authenticated). If user is null,
        // skip quizzes here to avoid permission errors and let the caller handle anon UI.
        if (!user) {
            hideLoader();
            return;
        }

        const quizzesQuery = query(collection(db, 'subjects', subjectId, 'quizzes'), orderBy('createdAt', 'asc'));
        let quizzesSnapshot;
        try {
            quizzesSnapshot = await getDocs(quizzesQuery);
        } catch (err) {
            console.warn('Could not read quizzes (permission?):', err);
            // show sign-in CTA as fallback
            if (quizzesListEl) {
                quizzesListEl.innerHTML = `
                    <div class="p-4 bg-yellow-50 rounded-lg text-center border border-yellow-100">
                        <p class="mb-3 text-gray-700">Please sign in to view this subject's quizzes.</p>
                        <a href="/auth.html" class="inline-block px-4 py-2 bg-yellow-500 text-white rounded">Sign in to access</a>
                    </div>
                `;
            }
            hideLoader();
            return;
        }

        // If we have a signed-in user, fetch their attempts for this subject and compute the BEST attempt per quiz
        // We store the highest-percent attempt and include its total/max points so the subject list can show "27/30" etc.
        let bestAttemptByQuiz = new Map();
        if (user) {
            try {
                const attemptsQuery = query(collection(db, 'users', user.uid, 'attempts'), where('subjectId', '==', subjectId));
                const attemptsSnap = await getDocs(attemptsQuery);
                // accumulate best attempt per quiz (highest percent)
                attemptsSnap.forEach(aDoc => {
                    const data = aDoc.data();
                    const qid = data.quizId;
                    const pct = typeof data.percent === 'number' ? data.percent : (typeof data.percent === 'string' ? parseFloat(data.percent) || 0 : 0);
                    const total = (typeof data.totalPoints === 'number') ? data.totalPoints : (typeof data.points === 'number' ? data.points : (data.totalPoints ?? 0));
                    const max = (typeof data.maxPoints === 'number') ? data.maxPoints : (data.maxPoints ?? null);

                    const questionCountFromDetails = Array.isArray(data.details) ? data.details.length : null;
                    const prev = bestAttemptByQuiz.get(qid);
                    if (!prev || pct > prev.percent) {
                        bestAttemptByQuiz.set(qid, {
                            percent: Math.round(pct),
                            totalPoints: total,
                            maxPoints: max,
                            questionCount: questionCountFromDetails
                        });
                    }
                });
            } catch (e) {
                console.error('Error fetching user attempts for subject:', e);
            }
            // unlockedQuizzes persistence is no longer used; skip reading it to save reads
        }

        if (quizzesSnapshot.empty) {
            quizzesListEl.innerHTML = '<p>No quizzes available for this subject yet.</p>';
            return;
        }

        // Convert snapshots to array so we can inspect previous quiz in sequence
        const quizzes = quizzesSnapshot.docs.map(d => ({ id: d.id, data: d.data() }));
        let quizzesHTML = '';
        for (let i = 0; i < quizzes.length; i++) {
            const quizId = quizzes[i].id;
            const quiz = quizzes[i].data;
            const quizURL = `/quiz.html?subjectId=${subjectId}&quizId=${quizId}`;

            // NOTE: progression locks removed — quizzes are always available (except scheduled releases)
            // keep releaseAt handling but ignore any minPointsToUnlock / persisted unlock flags
            const requiredPercent = typeof quiz.minPointsToUnlock === 'number'
                ? quiz.minPointsToUnlock
                : (typeof subjectDoc.data().minPointsToUnlock === 'number' ? subjectDoc.data().minPointsToUnlock : 60);
            const prevBest = bestAttemptByQuiz.get(quizzes[i - 1]?.id);
            let userBestPercentOnPrev = prevBest ? prevBest.percent : 0; // keep for informational uses if needed

            // check releaseAt (can be Firestore Timestamp or ISO string)
            let releaseAt = null;
            if (quiz.releaseAt) {
                try {
                    if (typeof quiz.releaseAt === 'object' && typeof quiz.releaseAt.toDate === 'function') {
                        releaseAt = quiz.releaseAt.toDate();
                    } else {
                        releaseAt = new Date(quiz.releaseAt);
                    }
                } catch (e) {
                    releaseAt = null;
                }
            }
            const now = new Date();
            const isUpcoming = releaseAt && now < releaseAt;

            if (isUpcoming) {
                const releaseText = releaseAt ? releaseAt.toLocaleString() : 'TBA';
                quizzesHTML += `
                    <a href="${quizURL}" class="relative block bg-gray-50 p-4 rounded-lg shadow-md hover:bg-white transition border border-gray-200">
                        <div class="flex items-center justify-between">
                            <h3 class="font-semibold text-lg text-slate-900">${quiz.name}</h3>
                            <span class="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">Upcoming • ${releaseText}</span>
                        </div>
                    </a>
                `;
            } else {
                // Display best attempt if available
                const best = bestAttemptByQuiz.get(quizId);
                let bestHtml = '';
                if (best) {
                    // Derive total question count from quiz metadata when available
                    const totalQuestions = (typeof best.questionCount === 'number' && best.questionCount > 0)
                        ? best.questionCount
                        : (quiz.questionCount || quiz.questionsCount || quiz.totalQuestions || quiz.questionTotal || (Array.isArray(quiz.questions) ? quiz.questions.length : null) || null);
                    if (totalQuestions && typeof best.percent === 'number') {
                        const correctDerived = Math.round((best.percent / 100) * totalQuestions);
                        bestHtml = `<div class="text-sm text-gray-600 dark:text-gray-400">${correctDerived}/${totalQuestions}</div>`;
                    } else if (best.maxPoints) {
                        bestHtml = `<div class="text-sm text-gray-600 dark:text-gray-400">${best.totalPoints}/${best.maxPoints}</div>`;
                    } else {
                        bestHtml = `<div class="text-sm text-gray-600 dark:text-gray-400">${best.percent}%</div>`;
                    }
                }
                quizzesHTML += `
                    <a href="${quizURL}" class="block bg-gray-50 p-4 rounded-lg shadow-md hover:bg-white transition border border-gray-200">
                        <div class="flex items-center justify-between">
                            <h3 class="font-semibold text-lg text-slate-900">${quiz.name}</h3>
                            ${bestHtml}
                        </div>
                    </a>
                `;
            }
        }
        quizzesListEl.innerHTML = quizzesHTML;
        hideLoader();
    };

    /**
     * Render subject cover and a sign-in CTA for anonymous visitors (avoids reading quizzes which may be restricted).
     */
    const displaySubjectForAnon = async () => {
        showLoader('Loading subject...');
        const subjectDocRef = doc(db, 'subjects', subjectId);
        try {
            const subjectDoc = await getDoc(subjectDocRef);
            if (subjectDoc.exists()) {
                const subjectData = subjectDoc.data();
                largeCoverEl.src = subjectData.largeCoverUrl;
                largeCoverEl.alt = subjectData.name;
            }
        } catch (err) {
            // ignore — we'll still show CTA without subject details
            console.warn('Could not read subject doc for anonymous visitor:', err);
        }
        if (quizzesListEl) {
            quizzesListEl.innerHTML = `
                <div class="p-4 bg-yellow-50 rounded-lg text-center border border-yellow-100">
                    <p class="mb-3 text-gray-700">This subject's quizzes and detailed content are available only to registered users.</p>
                    <a href="/auth.html" class="inline-block px-4 py-2 bg-yellow-500 text-white rounded">Sign in to access</a>
                </div>
            `;
        }
        hideLoader();
    };

    // Auth-aware initial load: always show subject cover. If user is signed in, show quizzes/unlocks;
    // otherwise show a CTA that asks the visitor to sign in to access quizzes/content.
    onAuthStateChanged(auth, async (user) => {
        try {
            // Render subject (cover + basic info)
            await displaySubjectDetails(user);

            if (user) {
                    // show header info and ensure user-menu links to profile
                    await fetchAndDisplayUserData(user);
                    const userMenu = document.getElementById('user-menu');
                    if (userMenu) userMenu.href = '/profile.html';
                    // restore avatar container styling for signed-in user
                    if (avatarHeader) avatarHeader.className = 'w-10 h-10 rounded-full overflow-hidden';
                    // quizzes were rendered for authenticated users by displaySubjectDetails
                } else {
                    // For anonymous visitors, replace quizzes list with a sign-in CTA
                    if (quizzesListEl) {
                        quizzesListEl.innerHTML = `
                            <div class="p-4 bg-yellow-50 rounded-lg text-center border border-yellow-100">
                                <p class="mb-3 text-gray-700">This subject's quizzes and detailed content are available only to registered users.</p>
                                <a href="/auth.html" class="inline-block px-4 py-2 bg-yellow-500 text-white rounded">Sign in to access</a>
                            </div>
                        `;
                    }
                    // change header user-menu to point to auth and show Sign In text in avatar area
                    const userMenu = document.getElementById('user-menu');
                    if (userMenu) userMenu.href = '/auth.html';
                    if (avatarHeader) {
                        // make the avatar area a plain Sign In text (no bg circle)
                        avatarHeader.className = 'text-blue-500 font-medium';
                        avatarHeader.innerHTML = `Sign In`;
                    }
                }
        } catch (e) {
            console.error('Error initializing subject page:', e);
            hideLoader();
        }
    });

});