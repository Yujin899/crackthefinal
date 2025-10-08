import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Lightweight in-app notifications system
// - listens to users/{uid}/notifications realtime
// - shows toasts for new notifications
// - updates users/{uid}.lastActive on visibility/activity
// - shows a "welcome back / reminder" toast if user was away longer than threshold

const REMINDER_DAYS = 3; // if user away longer than this, show a friendly reminder on return

let knownNotifications = new Set();

function ensureToastContainer() {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'fixed top-5 right-5 z-50 flex flex-col gap-2';
    document.body.appendChild(c);
  }
  return c;
}

function showToast({ title='', body='', timeout = 6000, onClick = null }) {
  const container = ensureToastContainer();
  const el = document.createElement('div');
  el.className = 'bg-white p-3 rounded-lg shadow-md border flex flex-col gap-1 max-w-sm cursor-pointer';
  el.innerHTML = `<div class="font-semibold text-sm">${title}</div><div class="text-sm text-slate-600">${body}</div>`;
  el.addEventListener('click', () => {
    if (onClick) try { onClick(); } catch(e){}
    el.remove();
  });
  container.appendChild(el);
  setTimeout(() => { try { el.remove(); } catch(e){} }, timeout);
  return el;
}

async function markUserActive(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { lastActive: serverTimestamp() });
  } catch (e) {
    // If user doc doesn't exist yet, attempt to create or skip
    try {
      const uref = doc(db, 'users', uid);
      await addDoc(collection(db, 'users', uid), {});
    } catch (_) {}
  }
}

function listenForNotifications(uid) {
  const notCol = collection(db, 'users', uid, 'notifications');
  const q = query(notCol, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach(change => {
      const id = change.doc.id;
      const data = change.doc.data();
      if (change.type === 'added') {
        if (!knownNotifications.has(id)) {
          knownNotifications.add(id);
          // show toast for unseen notifications
          const title = data.title || 'Notification';
          const body = data.body || '';
          showToast({ title, body, onClick: async () => {
            // mark as seen/read by updating doc
            try { await updateDoc(doc(db, 'users', uid, 'notifications', id), { seen: true }); } catch(e){}
            // optionally navigate if payload contains url
            if (data.url) window.location.href = data.url;
          }});
        }
      }
    });
  }, (err) => {
    console.warn('Notifications listener error:', err);
  });
}

async function checkAndShowReturnReminder(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const ud = await getDoc(userRef);
    if (!ud.exists()) return;
    const data = ud.data();
    if (!data || !data.lastActive) return;
    const last = data.lastActive.toDate ? data.lastActive.toDate() : new Date(data.lastActive);
    const diffDays = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= REMINDER_DAYS) {
      showToast({ title: 'We missed you!', body: `New quizzes may have been added while you were away. Check your subjects.` , timeout: 9000, onClick: () => { window.location.href = '/index.html'; } });
    }
  } catch (e) {
    console.warn('Return reminder check failed:', e);
  }
}

export function initNotifications() {
  let unsub = null;
  onAuthStateChanged(auth, async (user) => {
    if (unsub) { try { unsub(); } catch(e){} unsub = null; }
    if (user) {
      // mark active
      try { await updateDoc(doc(db, 'users', user.uid), { lastSeenAtClient: serverTimestamp() }); } catch(e){}
      // mark active on server
      try { await markUserActive(user.uid); } catch(e){}
      // show return reminder when user signs in after a while
      try { await checkAndShowReturnReminder(user.uid); } catch(e){}
      // listen for realtime notifications
      unsub = listenForNotifications(user.uid);
      // update lastActive on visibility change
      const onVisible = () => { try { markUserActive(user.uid); } catch(e){} };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) onVisible(); });
      window.addEventListener('beforeunload', () => { try { markUserActive(user.uid); } catch(e){} });
    } else {
      // anonymous: nothing to do
    }
  });
}

// Auto-init when this module is imported
try { initNotifications(); } catch(e) {}

// NOTE: For push notifications when the user is offline/away you will need to
// - configure Firebase Cloud Messaging (FCM) and a service worker
// - request push permission and get a messaging token (messaging.getToken)
// - run a server-side Cloud Function or server to send messages using the FCM server key
// This module implements in-app realtime notifications and a reminder when the user returns.
