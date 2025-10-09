// alertSystem.js - Handles global alerts and tracks user views
import { auth, db } from './firebase.js';
import { doc, getDoc, collection, query, where, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

class AlertSystem {
    constructor() {
        this.alertsContainer = null;
        this.activeAlerts = new Map();
        this.currentUser = null;
        this.modalOpen = false;
        this.queue = [];
        this.listening = false;
    }

    async initialize() {
        // Create alerts container if it doesn't exist
        if (!this.alertsContainer) {
            this.alertsContainer = document.createElement('div');
            this.alertsContainer.id = 'global-alerts-container';
            this.alertsContainer.className = 'fixed top-4 right-4 z-50 space-y-4 max-w-md w-full';
            document.body.appendChild(this.alertsContainer);
        }

        // Track auth changes but start listening for alerts for all users
        auth.onAuthStateChanged(user => { this.currentUser = user; });
        // Start listening once
        if (!this.listening) this.startListeningToAlerts();
    }

    startListeningToAlerts() {
        // Listen for active alerts
        const alertsQuery = query(
            collection(db, 'globalAlerts'),
            where('active', '==', true)
        );

        this.listening = true;
        this.unsubscribe = onSnapshot(alertsQuery, snapshot => {
            snapshot.docChanges().forEach(change => {
                const alert = change.doc.data();
                const alertId = change.doc.id;

                if (change.type === 'removed' || !alert.active) {
                    this.removeAlert(alertId);
                } else if (change.type === 'added' || change.type === 'modified') {
                    // check expiration (support Firestore Timestamp or number)
                    const expiresAt = alert.expiresAt && alert.expiresAt.seconds ? alert.expiresAt.seconds * 1000 : alert.expiresAt;
                    if (expiresAt && expiresAt < Date.now()) { this.removeAlert(alertId); return; }

                    // Check if user or visitor has already seen this alert
                    const seenByUser = this.currentUser && alert.seenBy && alert.seenBy[this.currentUser.uid];
                    const seenByVisitor = !!localStorage.getItem(`globalAlertSeen_${alertId}`);
                    if (seenByUser || seenByVisitor) return;

                    // Queue or show immediately
                    if (this.modalOpen) {
                        this.queue.push({ id: alertId, data: alert });
                    } else {
                        this.showAlert(alertId, alert);
                    }
                }
            });
        });
    }

    stopListeningToAlerts() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        this.alertsContainer.innerHTML = '';
        this.activeAlerts.clear();
    }

    getAlertColorClass(type) {
        switch (type) {
            case 'success': return 'bg-green-100 border-green-500 text-green-800';
            case 'error': return 'bg-red-100 border-red-500 text-red-800';
            case 'warning': return 'bg-yellow-100 border-yellow-500 text-yellow-800';
            default: return 'bg-blue-100 border-blue-500 text-blue-800';
        }
    }

    async showAlert(alertId, alertData) {
        if (this.activeAlerts.has(alertId)) return;

        // If on index page, show a blocking modal in front of all content
        const isIndex = ['/','/index.html','/index',''].includes(window.location.pathname.replace(/\/+$/,''));
        if (isIndex) {
            this._showModalAlert(alertId, alertData);
            return;
        }

        // Fallback: small toast in the corner (existing behavior)
        const alertEl = document.createElement('div');
        alertEl.className = `relative p-4 rounded-lg border ${this.getAlertColorClass(alertData.type)} shadow-lg`;
        alertEl.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-semibold">${alertData.title}</h4>
                    <p class="mt-1">${alertData.message}</p>
                </div>
                <button class="close-alert text-gray-500 hover:text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                </button>
            </div>
        `;

        // Add close handler
        alertEl.querySelector('.close-alert').addEventListener('click', () => {
            this.markAlertAsSeen(alertId);
            this.removeAlert(alertId);
        });

        this.alertsContainer.appendChild(alertEl);
        this.activeAlerts.set(alertId, alertEl);
    }

    _showModalAlert(alertId, alertData) {
        // build modal/backdrop
        this.modalOpen = true;
        const backdrop = document.createElement('div');
        backdrop.className = 'fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center';
        backdrop.id = `global-alert-backdrop-${alertId}`;
        // Add blur for backdrop (works even if Tailwind utilities are not available)
        backdrop.style.backdropFilter = 'blur(6px)';
        backdrop.style.webkitBackdropFilter = 'blur(6px)';

        const dialog = document.createElement('div');
        // narrower dialog, centered content, padding, and relative so close icon can position
        dialog.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full m-4 p-6 z-60 relative';
        dialog.setAttribute('role','dialog');
        dialog.setAttribute('aria-modal','true');
        dialog.innerHTML = `
            <button id="global-alert-close" aria-label="Close" class="absolute top-3 right-3 text-gray-600 dark:text-gray-300 hover:text-gray-900">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </button>
            <div class="flex flex-col items-center text-center">
                <h3 class="text-lg font-semibold mb-2">${alertData.title || 'Announcement'}</h3>
                <p class="text-sm text-gray-700 dark:text-gray-300">${alertData.message || ''}</p>
            </div>
            <div class="mt-6 flex justify-center">
                <button id="global-alert-ok" class="px-4 py-2 bg-blue-600 text-white rounded">OK</button>
            </div>
        `;

        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        // trap focus to dialog (basic)
        const okBtn = dialog.querySelector('#global-alert-ok');
        const closeBtn = dialog.querySelector('#global-alert-close');
        setTimeout(()=>{ try { okBtn.focus(); } catch(e){} }, 50);

        const closeHandler = async () => {
            try { backdrop.remove(); } catch(e){}
            this.modalOpen = false;
            // mark as seen for this visitor and (if logged-in) user
            await this.markAlertAsSeen(alertId);
            // show next queued alert if any
            if (this.queue.length) {
                const next = this.queue.shift();
                setTimeout(()=> this.showAlert(next.id, next.data), 200);
            }
        };

        okBtn.addEventListener('click', closeHandler);
        closeBtn.addEventListener('click', closeHandler);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeHandler(); });
        // Esc key closes
        const onKey = (e) => { if (e.key === 'Escape') { closeHandler(); window.removeEventListener('keydown', onKey); } };
        window.addEventListener('keydown', onKey);
    }

    removeAlert(alertId) {
        const alertEl = this.activeAlerts.get(alertId);
        if (alertEl) {
            alertEl.classList.add('opacity-0');
            setTimeout(() => {
                alertEl.remove();
                this.activeAlerts.delete(alertId);
            }, 300);
        }
    }

    async markAlertAsSeen(alertId) {
        try {
            // Always persist for guest in localStorage so they won't see repeated modals
            try { localStorage.setItem(`globalAlertSeen_${alertId}`, String(Date.now())); } catch(e){}

            if (this.currentUser) {
                const alertRef = doc(db, 'globalAlerts', alertId);
                try {
                    await updateDoc(alertRef, {
                        [`seenBy.${this.currentUser.uid}`]: Date.now()
                    });
                } catch (error) {
                    console.error('Error marking alert as seen in Firestore:', error);
                }
            }
        } catch (error) {
            console.error('Error marking alert as seen:', error);
        }
    }
}

// Create and initialize the alert system
const alertSystem = new AlertSystem();
alertSystem.initialize();

export default alertSystem;