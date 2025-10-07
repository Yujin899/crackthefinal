// points.js
// Advanced points engine: calculates points per question using streak multipliers and applies points to user.
import { doc, getDoc, updateDoc, setDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Configuration
const STREAK_BONUS_PER_STEP = 0.10; // 10% extra per consecutive correct after the first
const MAX_MULTIPLIER = 2.0; // cap multiplier at 2x
const LONG_STREAK_BONUS_THRESHOLD = 5; // streak length to earn a flat bonus
const LONG_STREAK_BONUS_POINTS = 5; // flat bonus for long streaks

/**
 * Calculate advanced points for a quiz attempt.
 * @param {Array} perQuestion - array produced by quiz.calculateResults() (each item should include .maxPoints and .correct)
 * @returns {object} { details, totalPoints, maxBasePoints, bonus, maxStreak }
 */
export function calculateAdvancedPoints(perQuestion) {
  let streak = 0;
  let maxStreak = 0;
  let total = 0;
  let maxBase = 0;
  const details = perQuestion.map((p) => {
    const base = typeof p.maxPoints === 'number' ? p.maxPoints : (typeof p.maxPoints === 'undefined' && typeof p.maxPoints === 'number' ? p.maxPoints : (p.maxPoints ?? 1));
    maxBase += base;

    if (p.correct) {
      streak += 1;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }

    const multiplier = p.correct ? Math.min(1 + STREAK_BONUS_PER_STEP * Math.max(0, streak - 1), MAX_MULTIPLIER) : 1;
    const earned = p.correct ? Math.round(base * multiplier) : 0;
    total += earned;

    return {
      qid: p.id,
      basePoints: base,
      earnedPoints: earned,
      multiplier,
      correct: !!p.correct,
      userAnswer: p.userAnswer ?? null,
      correctIndex: p.correctIndex ?? null,
      text: p.text ?? ''
    };
  });

  // long streak bonus
  let bonus = 0;
  if (maxStreak >= LONG_STREAK_BONUS_THRESHOLD) {
    bonus = LONG_STREAK_BONUS_POINTS;
    total += bonus;
  }

  return { details, totalPoints: total, maxBasePoints: maxBase, bonus, maxStreak };
}

/**
 * Apply earned points to the user's Firestore document.
 * Increments `points` field and updates `longestStreak` if needed.
 * @param {object} db - Firestore instance
 * @param {string} uid - user id
 * @param {number} earnedPoints
 * @param {number} candidateLongestStreak
 */
export async function applyPointsToUser(db, uid, earnedPoints, candidateLongestStreak) {
  if (!uid) return null;
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      // create minimal user fields if missing
      await setDoc(userRef, { points: earnedPoints, longestStreak: candidateLongestStreak, lastPointsUpdated: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
      return { previousPoints: 0, newPoints: earnedPoints, previousLongest: 0, newLongest: candidateLongestStreak };
    }

    const data = userSnap.data();
    const prevLongest = typeof data.longestStreak === 'number' ? data.longestStreak : 0;
    const newLongest = Math.max(prevLongest, candidateLongestStreak || 0);

    await updateDoc(userRef, {
      points: increment(earnedPoints),
      longestStreak: newLongest,
      lastPointsUpdated: serverTimestamp()
    });

    return { previousPoints: data.points || 0, newPoints: (data.points || 0) + earnedPoints, previousLongest: prevLongest, newLongest };
  } catch (err) {
    console.error('Error applying points to user:', err);
    return null;
  }
}
