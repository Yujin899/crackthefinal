// alertSystem.js - Handles global alerts and tracks user views
import { auth, db } from './firebase.js';
import { doc, getDoc, collection, query, where, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

class AlertSystem {
    constructor() {
        this.alertsContainer = null;
        this.activeAlerts = new Map();
        this.currentUser = null;
    }

    async initialize() {
        // Create alerts container if it doesn't exist
        if (!this.alertsContainer) {
            this.alertsContainer = document.createElement('div');
            this.alertsContainer.id = 'global-alerts-container';
            this.alertsContainer.className = 'fixed top-4 right-4 z-50 space-y-4 max-w-md w-full';
            document.body.appendChild(this.alertsContainer);
        }

        // Listen for auth state changes
        auth.onAuthStateChanged(user => {
            this.currentUser = user;
            if (user) {
                this.startListeningToAlerts();
            } else {
                this.stopListeningToAlerts();
            }
        });
    }

    startListeningToAlerts() {
        // Listen for active alerts
        const alertsQuery = query(
            collection(db, 'globalAlerts'),
            where('active', '==', true)
        );

        this.unsubscribe = onSnapshot(alertsQuery, snapshot => {
            snapshot.docChanges().forEach(change => {
                const alert = change.doc.data();
                const alertId = change.doc.id;

                if (change.type === 'removed' || !alert.active) {
                    this.removeAlert(alertId);
                } else if (change.type === 'added' || change.type === 'modified') {
                    // Check if alert has expired
                    if (alert.expiresAt && alert.expiresAt < Date.now()) {
                        this.removeAlert(alertId);
                        return;
                    }

                    // Check if user has already seen this alert
                    if (alert.seenBy && alert.seenBy[this.currentUser.uid]) {
                        return;
                    }

                    this.showAlert(alertId, alert);
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
        if (!this.currentUser) return;

        try {
            const alertRef = doc(db, 'globalAlerts', alertId);
            await updateDoc(alertRef, {
                [`seenBy.${this.currentUser.uid}`]: Date.now()
            });
        } catch (error) {
            console.error('Error marking alert as seen:', error);
        }
    }
}

// Create and initialize the alert system
const alertSystem = new AlertSystem();
alertSystem.initialize();

export default alertSystem;