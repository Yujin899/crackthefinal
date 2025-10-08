// firebase.js

// Import the necessary functions from the Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDWqZnwFwZRarFjkhPf0S3H9Hb_Vi4S0yM",
    authDomain: "academy-of-tooth.firebaseapp.com",
    projectId: "academy-of-tooth",
    storageBucket: "academy-of-tooth.appspot.com",
    messagingSenderId: "1090472868267",
    appId: "1:1090472868267:web:2e3550fef97121a227baee"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
// Notifications temporarily disabled. OneSignal/FCM integration removed for now.