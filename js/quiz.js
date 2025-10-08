import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp, doc, getDoc, updateDoc, where, limit } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { showLoader, hideLoader } from './loader.js';
import { calculateAdvancedPoints, applyPointsToUser } from './points.js';

document.addEventListener('DOMContentLoaded', () => {
  const url = new URL(window.location.href);
  const subjectId = url.searchParams.get('subjectId');
  const quizId = url.searchParams.get('quizId');

  const questionTextEl = document.getElementById('question-text');
  const answersBodyEl = document.getElementById('answers-body');
  const progressTextEl = document.getElementById('progress-text');
  const navLeft = document.getElementById('nav-left');
  const navRight = document.getElementById('nav-right');
  const navLeftMobile = document.getElementById('nav-left-mobile');
  const navRightMobile = document.getElementById('nav-right-mobile');

  if (!subjectId || !quizId) {
    questionTextEl.textContent = 'Invalid quiz link.';
    return;
  }

  let questions = [];
  let currentIndex = 0;
  const answers = []; // stores user's selected index per question

  let currentUser = null;

  async function loadQuestions() {
    showLoader('Loading quiz...');
    const q = query(collection(db, 'subjects', subjectId, 'quizzes', quizId, 'questions'), orderBy('createdAt'));
    const snapshot = await getDocs(q);
    questions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (questions.length === 0) {
      questionTextEl.textContent = 'No questions found for this quiz.';
      hideLoader();
      return;
    }
    // initialize answers
    for (let i = 0; i < questions.length; i++) answers[i] = null;
    renderQuestion();
    hideLoader();
  }

  function calculateResults() {
    // scoring engine: question.points (if number) else default 1
    const perQuestion = questions.map((question, idx) => {
      const maxPoints = (typeof question.points === 'number' && question.points > 0) ? question.points : 1;
      const correctIndex = typeof question.correctIndex === 'number' ? question.correctIndex : question.correct;
      const userAnswer = answers[idx];
      const correct = (userAnswer !== null && userAnswer === correctIndex);
      const pointsEarned = correct ? maxPoints : 0;
      return {
        idx,
        id: question.id,
        text: question.text || question.question || '',
        options: question.options || [],
        userAnswer,
        correctIndex,
        correct,
        pointsEarned,
        maxPoints
      };
    });

    const totalPoints = perQuestion.reduce((s, p) => s + p.pointsEarned, 0);
    const maxTotal = perQuestion.reduce((s, p) => s + p.maxPoints, 0);
    const percent = maxTotal > 0 ? Math.round((totalPoints / maxTotal) * 100) : 0;
    return { perQuestion, totalPoints, maxTotal, percent };
  }

  async function persistAttempt(resultSummary) {
    if (!currentUser) return null;
    try {
      // compute advanced points (streak, multiplier, bonuses)
  // Determine if this is the first attempt for this quiz by this user. If so, we'll apply points.
  const prevAttemptsQuery = query(collection(db, 'users', currentUser.uid, 'attempts'), where('quizId', '==', quizId), limit(1));
  const prevAttemptsSnap = await getDocs(prevAttemptsQuery);
  const isFirstAttempt = prevAttemptsSnap.empty;

  // Pass the full perQuestion objects so the points engine can access options, text and indexes
  const adv = calculateAdvancedPoints(resultSummary.perQuestion);

      const attempt = {
        quizId,
        subjectId,
        createdAt: serverTimestamp(),
        totalPoints: adv.totalPoints,
        maxPoints: adv.maxBasePoints,
        percent: resultSummary.percent,
        bonus: adv.bonus,
        longestStreakInAttempt: adv.maxStreak,
        // include question text and earned points per option for rich previews
        details: adv.details
      };

      const ref = await addDoc(collection(db, 'users', currentUser.uid, 'attempts'), attempt);

      // apply points to user doc only on the first attempt for this quiz
      if (isFirstAttempt) {
        try {
          await applyPointsToUser(db, currentUser.uid, adv.totalPoints, adv.maxStreak);
        } catch (e) {
          console.error('Error applying points to user after attempt:', e);
        }
      } else {
        console.log('Points not applied: user has attempted this quiz before.');
      }

      return ref.id;
    } catch (err) {
      console.error('Error persisting attempt:', err);
      return null;
    }
  }

  function renderQuestion() {
    const q = questions[currentIndex];
    questionTextEl.textContent = q.text || q.question || 'Question';
    progressTextEl.textContent = `Question ${currentIndex + 1} of ${questions.length}`;

    // render options as simple rows with a circular bullet (no border/background)
    answersBodyEl.innerHTML = '';
    q.options.forEach((opt, idx) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-4 p-3 rounded-lg transition cursor-pointer';

      const bullet = document.createElement('div');
      bullet.className = 'w-6 h-6 rounded-full border flex items-center justify-center';
      bullet.style.borderColor = '#cbd5e1';
      bullet.style.minWidth = '24px';
      bullet.style.minHeight = '24px';

      // if selected, show a filled blue circle with a centered check SVG
      if (answers[currentIndex] === idx) {
        bullet.style.backgroundColor = '#0ea5e9';
        bullet.style.borderColor = '#0ea5e9';
        bullet.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8z" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      } else {
        bullet.innerHTML = '';
      }

      const label = document.createElement('div');
      label.className = 'flex-1 text-left';
      label.textContent = opt;

      row.appendChild(bullet);
      row.appendChild(label);

      row.addEventListener('click', () => {
        answers[currentIndex] = idx;
        renderQuestion();
      });

      answersBodyEl.appendChild(row);
    });

    // update nav button visibility / text
    navLeft.disabled = currentIndex === 0;
    if (navLeft) {
      navLeft.classList.toggle('opacity-40', currentIndex === 0);
      navLeft.classList.toggle('pointer-events-none', currentIndex === 0);
    }
    if (navLeftMobile) {
      navLeftMobile.classList.toggle('opacity-40', currentIndex === 0);
      navLeftMobile.classList.toggle('pointer-events-none', currentIndex === 0);
    }
    const isLast = currentIndex === questions.length - 1;
    if (isLast) {
      // desktop: make the side button a prominent circular submit button with check icon
      navRight.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 md:h-7 md:w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
      // remove full-height and conflicting hover classes
      navRight.classList.remove('top-0', 'bottom-0', 'w-12', 'sm:w-16', 'md:w-20', 'flex-col', 'bg-transparent', 'hover:bg-blue-50', 'hover:shadow-md', 'hover:text-blue-600', 'text-slate-700');
      // add submit styling: larger on md+ screens, centered vertically
      navRight.classList.add('bg-blue-500', 'text-white', 'hover:bg-blue-600', 'rounded-full', 'shadow', 'w-12', 'h-12', 'md:w-16', 'md:h-16', 'flex', 'items-center', 'justify-center', 'transition-colors', 'duration-150');
      // position: stick to right and center vertically (works well on large screens)
      navRight.style.right = '1rem';
      navRight.style.top = '50%';
      navRight.style.transform = 'translateY(-50%)';
      navRight.style.bottom = '';
    } else {
      // restore arrow icon and original side-button behavior
      navRight.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>';
  // remove submit-specific classes
  navRight.classList.remove('bg-blue-500', 'text-white', 'hover:bg-blue-600', 'rounded-full', 'shadow', 'w-auto', 'py-2', 'h-auto', 'items-center', 'justify-center');
  // restore original visual classes for the arrow button and ensure centered alignment on large screens
  navRight.classList.add('text-slate-700', 'bg-transparent', 'hover:bg-blue-50', 'hover:shadow-md', 'hover:text-blue-600', 'w-12', 'sm:w-16', 'md:w-20');
  // ensure it displays as flex and centers the svg
  navRight.classList.add('flex', 'items-center', 'justify-center');
  navRight.classList.remove('flex-col');
  // position: center vertically on big screens so arrow is visually centered
  navRight.style.right = '';
  navRight.style.top = '50%';
  navRight.style.transform = 'translateY(-50%)';
  navRight.style.bottom = '';
    }
    // Mobile right button: show check icon on last question (keep it active)
    if (navRightMobile) {
      if (isLast) {
        navRightMobile.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
        navRightMobile.classList.add('bg-blue-500', 'text-white', 'hover:bg-blue-600');
      } else {
        navRightMobile.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>';
        navRightMobile.classList.remove('bg-blue-500', 'text-white', 'hover:bg-blue-600');
      }
    }
    // do not disable the mobile right button on the last question; it becomes Submit
  }

  navLeft.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  });

  if (navLeftMobile) {
    navLeftMobile.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
      }
    });
  }

  navRight.addEventListener('click', async () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion();
      return;
    }
    // last question -> submit answers: calculate, persist, and render detailed results
  showLoader('Calculating results...');
  const resultSummary = calculateResults();
  // persistAttempt now applies points and returns the attempt id; adv info is embedded in attempt details
  const attemptId = await persistAttempt(resultSummary);
  hideLoader();
  // we can show the persisted attempt info via attemptId; renderResults reads resultSummary which now includes percent and perQuestion, bonus shown from persisted attempt is optional
  renderResults(resultSummary, attemptId);
  });

  function renderResults(resultSummary, attemptId = null) {
    // header
    questionTextEl.textContent = 'Results';
    progressTextEl.textContent = `Score: ${resultSummary.totalPoints} / ${resultSummary.maxTotal} (${resultSummary.percent}%)`;

    // build details
    const wrap = document.createElement('div');
    wrap.className = 'p-4 space-y-4';

    resultSummary.perQuestion.forEach((p) => {
      const qWrap = document.createElement('div');
      qWrap.className = 'p-3 rounded-lg bg-white/80 border ctf-result-wrap';

  const qText = document.createElement('div');
  qText.className = 'font-semibold mb-2 ctf-result-question';
      qText.textContent = `${p.idx + 1}. ${p.text}`;

      qWrap.appendChild(qText);

      p.options.forEach((opt, i) => {
        const optRow = document.createElement('div');
        optRow.className = 'flex items-center gap-3 py-1';

        const mark = document.createElement('div');
        mark.className = 'w-5 h-5 rounded-full flex items-center justify-center';
        if (i === p.correctIndex) {
          mark.classList.add('ctf-mark-correct');
          mark.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8z" clip-rule="evenodd"/></svg>';
        } else if (i === p.userAnswer && !p.correct) {
          mark.classList.add('ctf-mark-wrong');
          mark.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6.293 6.293a1 1 0 011.414 0L10 8.586l2.293-2.293a1 1 0 111.414 1.414L11.414 10l2.293 2.293a1 1 0 01-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 01-1.414-1.414L8.586 10 6.293 7.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
        } else {
          mark.classList.add('ctf-mark-neutral');
        }

        const optLabel = document.createElement('div');
        optLabel.textContent = opt;

        optRow.appendChild(mark);
        optRow.appendChild(optLabel);
        qWrap.appendChild(optRow);
      });

  const pointsRow = document.createElement('div');
  pointsRow.className = 'mt-2 text-sm text-gray-600 ctf-points';
      pointsRow.textContent = `Points: ${p.pointsEarned} / ${p.maxPoints}`;
      qWrap.appendChild(pointsRow);

      wrap.appendChild(qWrap);
    });

    // attempt id and back link
    const footer = document.createElement('div');
  footer.className = 'p-4 text-center';
  footer.innerHTML = `<div class="mb-2">${attemptId ? `Attempt saved` : ''} ${resultSummary.bonus ? `• Bonus: ${resultSummary.bonus} pts` : ''}</div><a href="/subject.html?id=${subjectId}" class="text-blue-500 underline">Back to subject</a>`;

    answersBodyEl.innerHTML = '';
    answersBodyEl.appendChild(wrap);
    answersBodyEl.appendChild(footer);

    // hide navigation controls while previewing answers
    try {
      if (navLeft) navLeft.style.display = 'none';
      if (navRight) navRight.style.display = 'none';
      const mobileNav = document.getElementById('mobile-nav');
      if (mobileNav) mobileNav.style.display = 'none';
    } catch (e) {
      // no-op if elements missing
    }
  }

  if (navRightMobile) {
    navRightMobile.addEventListener('click', async () => {
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        renderQuestion();
        return;
      }
      // last question -> submit answers (reuse same flow)
      navRight.click();
    });
  }

  // auth guard and load
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      loadQuestions();
    } else {
      window.location.href = '/auth.html';
    }
  });
});
