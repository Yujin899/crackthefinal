// shop.js
// Shop system: convert points -> gold, buy skills, apply skills (steal random / steal targeted)

import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import SKILLS from './skill.js';
import { showLoader, hideLoader } from './loader.js';

/**
 * Utility: fetch a list of other users (candidates) to target for steal.
 * We'll pick active users ordered by points desc to be interesting.
 */
async function fetchCandidateUsers(db, excludeUid, limit = 30) {
  showLoader('Loading candidates...');
  const usersQ = query(collection(db, 'users'), orderBy('points', 'desc'));
  const snap = await getDocs(usersQ);
  const users = [];
  snap.forEach(d => {
    if (d.id === excludeUid) return;
    users.push({ id: d.id, ...d.data() });
  });
  hideLoader();
  return users.slice(0, limit);
}

/**
 * Convert user points to gold. We keep a simple rate: 100 pts -> 1 gold.
 * The conversion deducts points and increments `gold` on the user doc.
 */
export async function convertPointsToGold(db, uid, pointsToConvert) {
  if (pointsToConvert <= 0) throw new Error('Invalid points');
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User not found');
  const user = userSnap.data();
  const currentPoints = user.points || 0;
  if (currentPoints < pointsToConvert) throw new Error('Not enough points');

  const goldEarned = Math.floor(pointsToConvert / 100); // integer gold
  if (goldEarned <= 0) throw new Error('Not enough points to convert to gold (min 100)');

  await updateDoc(userRef, { points: currentPoints - pointsToConvert, gold: (user.gold || 0) + goldEarned });
  return { goldEarned };
}

/**
 * Buy a skill: deduct gold and add skill entry to user doc (skills map with levels/uses)
 */
export async function buySkill(db, uid, skillId) {
  const skill = SKILLS[skillId];
  if (!skill) throw new Error('Skill not found');
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User not found');
  const user = userSnap.data();
  const currentGold = user.gold || 0;
  if (currentGold < skill.cost) throw new Error('Not enough gold');

  // simple skill inventory: map skillId -> level or count
  const skills = user.skills || {};
  skills[skillId] = (skills[skillId] || 0) + 1;

  await updateDoc(userRef, { gold: currentGold - skill.cost, skills });
  return { purchased: true, skills };
}

/**
 * Apply skill: handles steal_random_lv1 and steal_target_lv2.
 * The function ensures atomic update using a write batch: deduct from victim, add to attacker.
 */
export async function applySkill(db, uid, skillId, opts = {}) {
  const skill = SKILLS[skillId];
  if (!skill) throw new Error('Skill not found');

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User not found');
  const user = userSnap.data();

  const userSkills = user.skills || {};
  if (!userSkills[skillId] || userSkills[skillId] <= 0) throw new Error('Skill not owned');

  if (skillId === 'steal_random_lv1') {
    // pick a random victim from top users excluding self
    const candidates = await fetchCandidateUsers(db, uid, 50);
    if (candidates.length === 0) throw new Error('No candidates to steal from');
    const victim = candidates[Math.floor(Math.random() * candidates.length)];
    const stealAmount = Math.max(1, Math.floor((victim.points || 0) * 0.05)); // steal 5% or at least 1

    const victimRef = doc(db, 'users', victim.id);
    const batch = writeBatch(db);
    batch.update(victimRef, { points: Math.max(0, (victim.points || 0) - stealAmount) });
    batch.update(userRef, { points: (user.points || 0) + stealAmount });
    // decrement skill
    userSkills[skillId] = userSkills[skillId] - 1;
    batch.update(userRef, { skills: userSkills });
    await batch.commit();

    return { success: true, amount: stealAmount, from: victim.id };
  }

  if (skillId === 'steal_target_lv2') {
    const targetId = opts.targetUserId;
    if (!targetId) throw new Error('Target user id required for Lv2');
    const victimSnap = await getDoc(doc(db, 'users', targetId));
    if (!victimSnap.exists()) throw new Error('Target user not found');
    const victim = victimSnap.data();
    const stealAmount = Math.max(1, Math.floor((victim.points || 0) * 0.15)); // steal 15% or at least 1

    const victimRef = doc(db, 'users', targetId);
    const batch = writeBatch(db);
    batch.update(victimRef, { points: Math.max(0, (victim.points || 0) - stealAmount) });
    batch.update(userRef, { points: (user.points || 0) + stealAmount });
    // decrement skill
    userSkills[skillId] = userSkills[skillId] - 1;
    batch.update(userRef, { skills: userSkills });
    await batch.commit();

    return { success: true, amount: stealAmount, from: targetId };
  }

  throw new Error('Unhandled skill');
}

/**
 * Render shop UI inside a container and wire actions.
 */
export async function renderShop(db, uid, containerEl) {
  showLoader('Loading shop...');
  containerEl.innerHTML = '<p class="text-gray-500">Loading shop...</p>';
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const user = userSnap.exists() ? userSnap.data() : {};

  // Build shop UI
  const gold = user.gold || 0;
  const points = user.points || 0;
  const skills = user.skills || {};

  const html = `
    <div class="mb-4 flex items-center justify-between">
      <div>
        <div class="text-sm text-gray-500">Points: <span id="shop-points">${points}</span></div>
        <div class="text-sm text-yellow-500">Gold: <span id="shop-gold">${gold}</span></div>
      </div>
      <div>
        <button id="convert-100" class="bg-blue-500 text-white px-3 py-1 rounded">Convert 100 pts</button>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      ${Object.values(SKILLS).map(s => `
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <div class="w-full h-56 md:h-64 bg-gray-100 overflow-hidden">
            ${s.image ? `<img src="${s.image}" class="w-full h-full object-cover">` : ''}
          </div>
          <div class="p-6 flex flex-col items-center text-center">
            <div class="w-full">
              <div class="flex items-center justify-between mb-2">
                <div class="font-semibold text-lg text-slate-800">${s.name}</div>
                <div class="text-sm text-gray-500">${s.cost} gold</div>
              </div>
              <div class="text-sm text-gray-600 mb-4">${s.description}</div>
              <div class="flex items-center justify-center gap-3">
                <button data-skill-id="${s.id}" class="buy-skill bg-green-500 text-white px-4 py-2 rounded">Buy</button>
                <div class="text-sm">Owned: <span class="owned-count">${skills[s.id] || 0}</span></div>
                ${s.id === 'steal_target_lv2' ? '<button class="choose-target btn-target text-sm text-blue-600 underline">Choose target</button>' : ''}
              </div>
            </div>
          </div>
        </div>
      `).join('\n')}
    </div>
  `;

  containerEl.innerHTML = html;

  hideLoader();

  // wire convert button
  const convertBtn = containerEl.querySelector('#convert-100');
  convertBtn.addEventListener('click', async () => {
    try {
      await convertPointsToGold(db, uid, 100);
      // re-render
      await renderShop(db, uid, containerEl);
    } catch (e) {
      alert(e.message || 'Conversion failed');
    }
  });

  // wire buy buttons
  containerEl.querySelectorAll('.buy-skill').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const skillId = btn.getAttribute('data-skill-id');
      try {
        await buySkill(db, uid, skillId);
        await renderShop(db, uid, containerEl);
      } catch (e) {
        alert(e.message || 'Purchase failed');
      }
    });
  });

  // target chooser for level2: show a simple list of candidates in a small modal-like area
  containerEl.querySelectorAll('.choose-target').forEach(async (btn) => {
    btn.addEventListener('click', async () => {
      // fetch candidates
      const candidates = await fetchCandidateUsers(db, uid, 30);
      const listHtml = candidates.map(c => `
        <div class="p-2 border-b flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-gray-200 rounded-full overflow-hidden">${c.avatar ? `<img src="${c.avatar}" class="w-full h-full object-cover">` : ''}</div>
            <div class="font-semibold">${c.username || 'Anon'}</div>
          </div>
          <div><button data-target-id="${c.id}" class="apply-target bg-red-500 text-white px-2 py-1 rounded">Steal</button></div>
        </div>
      `).join('\n');

      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
      overlay.innerHTML = `<div class="bg-white rounded-lg w-[90%] max-w-2xl p-4 max-h-[70vh] overflow-auto">` +
        `<div class="flex justify-between items-center mb-2"><h3 class="font-bold">Choose target to rob</h3><button id="close-target" class="text-slate-600">Close</button></div>` +
        `<div>${listHtml}</div></div>`;
      document.body.appendChild(overlay);

      overlay.querySelectorAll('.apply-target').forEach(b => {
        b.addEventListener('click', async () => {
          const targetId = b.getAttribute('data-target-id');
          try {
            const res = await applySkill(db, uid, 'steal_target_lv2', { targetUserId: targetId });
            alert(`Stole ${res.amount} pts from user ${res.from}`);
            document.body.removeChild(overlay);
            await renderShop(db, uid, containerEl);
          } catch (e) {
            alert(e.message || 'Could not steal');
          }
        });
      });

      overlay.querySelector('#close-target').addEventListener('click', () => document.body.removeChild(overlay));
    });
  });

}

export default {
  renderShop,
  buySkill,
  convertPointsToGold,
  applySkill
};
