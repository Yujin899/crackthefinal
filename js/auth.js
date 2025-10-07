// auth.js

import { auth, db } from './firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    onAuthStateChanged // <-- NEW: Import this function
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { 
    doc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    //  NEW: Check Auth State on Page Load
    // =================================================================
    // This listener checks if a user is already logged in.
    // If they are, it redirects them away from the auth page.
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, see https://firebase.google.com/docs/auth/web/start
            console.log('User is already logged in. Redirecting to home.html...');
            window.location.href = '/home.html';
        } else {
            // User is signed out, so they can stay on the auth page.
            console.log('No user signed in. Displaying auth page.');
        }
    });
    // =================================================================


    // Form elements and inputs
    const signInForm = document.getElementById('signInForm');
    const signUpForm = document.getElementById('signUpForm');
    const signUpButton = signUpForm.querySelector('button[type="submit"]');
    const signInButton = signInForm.querySelector('button[type="submit"]');
    const signUpButtonText = signUpButton.innerHTML;
    const signInButtonText = signInButton.innerHTML;
    // ... rest of the elements

    // --- HELPER FUNCTIONS (No Changes Here) ---
    const spinnerSVG = `<svg class="spinner h-5 w-5 text-white" ...>...</svg>`; // (The full SVG string)
    const showLoadingState = (button) => { /* ... Unchanged ... */ };
    const hideLoadingState = (button, originalText) => { /* ... Unchanged ... */ };
    const showToast = (message, type = 'error') => { /* ... Unchanged ... */ };

    // --- FIREBASE AUTHENTICATION LOGIC (No Changes Here) ---

    // Sign Up Handler
    signUpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoadingState(signUpButton);

        const name = document.getElementById('signUpName').value;
        const email = document.getElementById('signUpEmail').value.trim();
        const password = document.getElementById('signUpPassword').value;

        const emailParts = email.split('@');
        if (emailParts.length !== 2 || emailParts[1] !== 'crackthefinal.de') {
            showToast('Invalid Email. Must use @crackthefinal.de');
            hideLoadingState(signUpButton, signUpButtonText);
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                username: name,
                email: email,
                avatar: generateAvatar(name),
                isAdmin: false,
                createdAt: new Date()
            });
            window.location.href = '/home.html';
        } catch (error) {
            hideLoadingState(signUpButton, signUpButtonText);
            console.error("Sign up error:", error.code, error.message);
            if (error.code === 'auth/email-already-in-use') { showToast('This email is already registered.'); } 
            else if (error.code === 'auth/weak-password') { showToast('Password should be at least 6 characters.'); } 
            else { showToast('Failed to create account. Please try again.'); }
        }
    });

    // Sign In Handler
    signInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoadingState(signInButton);
        
        const email = document.getElementById('signInEmail').value;
        const password = document.getElementById('signInPassword').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = '/home.html';
        } catch (error) {
            hideLoadingState(signInButton, signInButtonText);
            console.error("Sign in error:", error.code, error.message);
            if (error.code === 'auth/invalid-credential') { showToast('Incorrect email or password.'); } 
            else { showToast('Failed to sign in. Please try again.'); }
        }
    });


    // --- All other functions pasted below for completeness ---
    // (These functions are unchanged, but included so you can copy the whole file)
    const toastContainer = document.getElementById('toast-container');
    const emailSuggestionsContainer = document.getElementById('email-suggestions');
    const showSignUpButton = document.getElementById('showSignUp');
    const showSignInButton = document.getElementById('showSignIn');
    
    // The full, unchanged code for all helper functions is pasted below.
    const showToastUnchanged = (message, type = 'error') => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 7000);
    };

    const spinnerSVGUnchanged = `<svg class="spinner h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    const showLoadingStateUnchanged = (button) => {
        button.disabled = true;
        button.innerHTML = spinnerSVGUnchanged;
    };
    const hideLoadingStateUnchanged = (button, originalText) => {
        button.disabled = false;
        button.innerHTML = originalText;
    };

    const generateAvatar = (name) => {
        const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const colors = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b6a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef"];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="${randomColor}" /><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" fill="#ffffff">${initials}</text></svg>`;
        return `data:image/svg+xml;base64,${btoa(svg)}`;
    };
    const generateEmailSuggestions = (name) => {
        const domain = "@crackthefinal.de";
        const cleanedName = name.toLowerCase().trim().replace(/\s+/g, ' ');
        if (!cleanedName) return [];
        const parts = cleanedName.split(' ');
        const firstName = parts[0];
        const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
        const suggestions = new Set();
        suggestions.add(`${firstName}${domain}`);
        if (lastName) {
            suggestions.add(`${firstName}.${lastName}${domain}`);
            suggestions.add(`${firstName}${lastName}${domain}`);
            suggestions.add(`${firstName[0]}${lastName}${domain}`);
        }
        suggestions.add(cleanedName.replace(' ', '.') + domain);
        suggestions.add(cleanedName.replace(' ', '') + domain);
        return Array.from(suggestions).slice(0, 4);
    };
    document.getElementById('signUpName').addEventListener('keyup', () => {
        const nameValue = document.getElementById('signUpName').value;
        const suggestions = generateEmailSuggestions(nameValue);
        emailSuggestionsContainer.innerHTML = '';
        if (suggestions.length > 0) {
            suggestions.forEach(email => {
                const item = document.createElement('div');
                item.textContent = email;
                item.className = 'p-2 hover:bg-gray-100 cursor-pointer text-sm';
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    document.getElementById('signUpEmail').value = email;
                    emailSuggestionsContainer.style.display = 'none';
                });
                emailSuggestionsContainer.appendChild(item);
            });
        }
    });
    document.getElementById('signUpEmail').addEventListener('focus', () => {
        if (emailSuggestionsContainer.children.length > 0) {
            emailSuggestionsContainer.style.display = 'block';
        }
    });
    document.addEventListener('click', (e) => {
        if (!document.getElementById('signUpEmail').contains(e.target) && !emailSuggestionsContainer.contains(e.target)) {
            emailSuggestionsContainer.style.display = 'none';
        }
    });
    const switchForm = (showForm, hideForm) => {
        hideForm.classList.add('slide-leave-to');
        setTimeout(() => {
            hideForm.classList.add('hidden');
            hideForm.classList.remove('slide-leave-to');
            showForm.classList.remove('hidden');
            showForm.classList.add('slide-enter-from');
            void showForm.offsetWidth;
            showForm.classList.add('slide-enter-to');
        }, 300);
    };
    showSignUpButton.addEventListener('click', () => switchForm(signUpForm, signInForm));
    showSignInButton.addEventListener('click', () => switchForm(signInForm, signUpForm));
});