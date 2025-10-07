// index.js

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { showLoader, hideLoader } from './loader.js';
import Shop from './shop.js';
// Feature flag: toggle to true when the shop is ready for production
const SHOP_ENABLED = false;

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    //  MODIFIED: Changed Events Slider effect to "Fade"
    // =================================================================
    const eventsSwiper = new Swiper('.events-swiper', {
        effect: 'coverflow',
        coverflowEffect: {
            rotate: 50,
            stretch: 0,
            depth: 100,
            modifier: 1,
            slideShadows: true
        },
        loop: true,
        autoplay: {
            delay: 4000,
            disableOnInteraction: false,
        },
        pagination: {
            el: '.events-swiper .swiper-pagination',
            clickable: true,
        },
    });

    // Initialize the Subjects Slider (configuration remains the same)
    const subjectsSwiper = new Swiper('.subjects-swiper', {
        loop: false,
        slidesPerView: 1.3,
        centeredSlides: true,
        spaceBetween: 16,
        breakpoints: {
            640: { slidesPerView: 1.5, centeredSlides: false, spaceBetween: 20 },
            768: { slidesPerView: 2.5, centeredSlides: false, spaceBetween: 30 },
            1024: { slidesPerView: 3.5, centeredSlides: false, spaceBetween: 30 }
        },
        pagination: {
            el: '.subjects-swiper ~ .swiper-pagination',
            clickable: true,
        },
        navigation: {
            nextEl: '.subjects-swiper ~ .swiper-button-next',
            prevEl: '.subjects-swiper ~ .swiper-button-prev',
        },
    });

    /**
     * Fetches subjects from Firestore and displays them in the slider.
     */
    const displaySubjects = async () => {
        showLoader('Loading subjects...');
        const swiperWrapper = document.querySelector('.subjects-swiper .swiper-wrapper');
        if (!swiperWrapper) return;
        const subjectsQuery = query(collection(db, 'subjects'), orderBy('createdAt', 'desc'));
        const subjectsSnapshot = await getDocs(subjectsQuery);
        let slidesHTML = '';
        subjectsSnapshot.forEach(doc => {
            const subject = doc.data();
            const subjectURL = `/subject.html?id=${doc.id}`;
            slidesHTML += `
                <div class="swiper-slide">
                    <a href="${subjectURL}" class="group block rounded-lg shadow-md overflow-hidden transform hover:-translate-y-1 transition-all duration-300">
                        <img src="${subject.smallCoverUrl}" alt="${subject.name}" class="w-full h-full object-cover">
                    </a>
                </div>
            `;
        });
        swiperWrapper.innerHTML = slidesHTML;
        subjectsSwiper.update();
        hideLoader();
    };

    /**
     * Fetches users ordered by points and renders the leaderboard.
     */
    const displayLeaderboard = async () => {
        const lbEl = document.getElementById('leaderboard-list');
        if (!lbEl) return;
        lbEl.innerHTML = '<p class="text-gray-500">Loading leaderboard...</p>';
        try {
            const usersQuery = query(collection(db, 'users'), orderBy('points', 'desc'));
            const usersSnap = await getDocs(usersQuery);
            if (usersSnap.empty) {
                lbEl.innerHTML = '<p class="text-gray-500">No users yet.</p>';
                return;
            }

            let rank = 1;
            const rows = [];
            usersSnap.forEach(u => {
                const d = u.data();
                rows.push(`<div class="flex items-center p-3 border-b">
                    <span class="font-bold text-lg w-8">${rank++}.</span>
                    <div class="w-10 h-10 bg-gray-300 rounded-full mr-4 overflow-hidden">
                        ${d.avatar ? `<img src="${d.avatar}" class="w-full h-full object-cover">` : ''}
                    </div>
                    <span class="font-semibold grow">${d.username || 'Anon'}</span>
                    <span class="font-bold text-yellow-500">${d.points || 0} pts</span>
                </div>`);
            });

            lbEl.innerHTML = rows.join('\n');
        } catch (e) {
            console.error('Error loading leaderboard:', e);
            lbEl.innerHTML = '<p class="text-red-500">Error loading leaderboard.</p>';
        }
    };

    /**
     * Fetches user data from Firestore and updates the UI in the header.
     */
    const fetchAndDisplayUserData = async (user) => {
        const usernameHeader = document.getElementById('username-header');
        const avatarHeader = document.getElementById('avatar-header');
        const userDocRef = doc(db, 'users', user.uid);
        try {
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const userData = userDoc.data();
                usernameHeader.textContent = userData.username;
                avatarHeader.innerHTML = `<img src="${userData.avatar}" alt="User Avatar" class="w-10 h-10 rounded-full object-cover">`;
            } else {
                console.warn("No user data found in Firestore! Creating default user document.");
                // Create a minimal user document for legacy/auth-only users
                const defaultUsername = user.displayName || (user.email ? user.email.split('@')[0] : 'Guest');
                try {
                    await setDoc(userDocRef, {
                        uid: user.uid,
                        username: defaultUsername,
                        email: user.email || '',
                        avatar: '',
                        isAdmin: false,
                        createdAt: new Date()
                    });
                    usernameHeader.textContent = defaultUsername;
                    avatarHeader.innerHTML = '';
                } catch (writeErr) {
                    console.error('Failed to create default user doc:', writeErr);
                    usernameHeader.textContent = 'Guest';
                }
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
        }
    };

    // Auth State Checker (Route Guard)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            fetchAndDisplayUserData(user);
            displaySubjects();
            displayLeaderboard();
            // initialize shop if present (feature-flagged)
            const shopEl = document.getElementById('shop-root');
            if (shopEl) {
                if (SHOP_ENABLED) {
                    Shop.renderShop(db, user.uid, shopEl).catch(e => console.error('Shop init error', e));
                } else {
                    shopEl.innerHTML = `
                        <div class="p-6 text-center">
                            <h3 class="text-xl font-semibold mb-2">Shop — Coming Soon</h3>
                            <p class="text-sm text-gray-500">We're polishing the shop before launch. Check back later!</p>
                        </div>`;
                }
            }
        } else {
            // Redirect to auth page after a short delay so users see the loader briefly
            setTimeout(() => { window.location.href = '/index.html'; }, 120);
        }
    });

});