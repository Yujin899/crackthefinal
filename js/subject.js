// subject.js

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
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
                usernameHeader.textContent = userData.username;
                avatarHeader.innerHTML = `<img src="${userData.avatar}" alt="User Avatar" class="w-10 h-10 rounded-full object-cover">`;
            }
        } catch (error) {
            console.error("Error fetching user data for header:", error);
        }
    };


    const displaySubjectDetails = async (user = null) => {
        showLoader('Loading subject...');
        const subjectDocRef = doc(db, 'subjects', subjectId);
        const subjectDoc = await getDoc(subjectDocRef);

        if (subjectDoc.exists()) {
            const subjectData = subjectDoc.data();
            largeCoverEl.src = subjectData.largeCoverUrl;
            largeCoverEl.alt = subjectData.name;
            // The H1 element for the subject name has been removed from HTML
        } else {
            document.body.innerHTML = '<h1>Error: Subject Not Found.</h1>';
            return;
        }

        const quizzesQuery = query(collection(db, 'subjects', subjectId, 'quizzes'), orderBy('createdAt', 'asc'));
        const quizzesSnapshot = await getDocs(quizzesQuery);

        // If we have a signed-in user, fetch their attempts for this subject and compute best totalPoints per quiz
        let bestPointsByQuiz = new Map();
        if (user) {
            try {
                const attemptsQuery = query(collection(db, 'users', user.uid, 'attempts'), where('subjectId', '==', subjectId));
                const attemptsSnap = await getDocs(attemptsQuery);
                attemptsSnap.forEach(doc => {
                    const data = doc.data();
                    const qid = data.quizId;
                    const pts = typeof data.totalPoints === 'number' ? data.totalPoints : 0;
                    const prev = bestPointsByQuiz.get(qid) || 0;
                    if (pts > prev) bestPointsByQuiz.set(qid, pts);
                });
            } catch (e) {
                console.error('Error fetching user attempts for subject:', e);
            }
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

            // determine required points to unlock this quiz: quiz -> subject -> default 60
            const requiredPoints = typeof quiz.minPointsToUnlock === 'number'
                ? quiz.minPointsToUnlock
                : (typeof subjectDoc.data().minPointsToUnlock === 'number' ? subjectDoc.data().minPointsToUnlock : 60);

            // first quiz is never locked
            let locked = false;
            let userPointsOnPrev = 0;
            if (i === 0) {
                locked = false;
            } else {
                const prevQuizId = quizzes[i - 1].id;
                userPointsOnPrev = bestPointsByQuiz.get(prevQuizId) || 0;
                locked = requiredPoints > 0 && userPointsOnPrev < requiredPoints;
            }

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

            if (locked) {
                quizzesHTML += `
                    <div class="bg-gray-50 p-4 rounded-lg shadow-md opacity-95 border border-gray-200">
                        <div class="flex items-start justify-between gap-4">
                            <h3 class="font-semibold text-lg text-slate-900 break-words">${quiz.name}</h3>
                            <div class="hidden sm:flex flex-shrink-0 items-center gap-2 text-sm text-gray-500">
                                <svg xmlns=\"http://www.w3.org/2000/svg\" class=\"h-5 w-5 text-gray-400\" viewBox=\"0 0 20 20\" fill=\"currentColor\"><path fill-rule=\"evenodd\" d=\"M5 8V6a5 5 0 1110 0v2h1a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1h1zm2-2a3 3 0 116 0v2H7V6z\" clip-rule=\"evenodd\"/></svg>
                                <span>Locked: need ${requiredPoints} pts (you: ${userPointsOnPrev} pts)</span>
                            </div>
                        </div>
                        <div class="mt-2 sm:hidden text-sm text-gray-500 flex items-start gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 8V6a5 5 0 1110 0v2h1a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1h1zm2-2a3 3 0 116 0v2H7V6z" clip-rule="evenodd"/></svg>
                            <span class="break-words">Locked: need ${requiredPoints} pts in previous quiz (you: ${userPointsOnPrev} pts)</span>
                        </div>
                    </div>
                `;
            } else if (isUpcoming) {
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
                quizzesHTML += `
                    <a href="${quizURL}" class="block bg-gray-50 p-4 rounded-lg shadow-md hover:bg-white transition border border-gray-200">
                        <h3 class="font-semibold text-lg text-slate-900">${quiz.name}</h3>
                    </a>
                `;
            }
        }
        quizzesListEl.innerHTML = quizzesHTML;
        hideLoader();
    };

    // Auth guard and initial load
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // load header info and subject details (user passed for unlock checks)
            fetchAndDisplayUserData(user);
            displaySubjectDetails(user);
        } else {
            window.location.href = '/index.html';
        }
    });

});