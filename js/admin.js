// admin.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, addDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { showLoader, hideLoader } from './loader.js';

// --- Cloudinary Configuration ---
const CLOUD_NAME = "dqiwsls5y";
const UPLOAD_PRESET = "crackthefinal";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// --- SVG Spinner for loading states ---
const spinnerSVG = `<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

document.addEventListener('DOMContentLoaded', () => {
    // --- Admin Access Guard ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists() && userDoc.data().isAdmin === true) {
                console.log("Welcome Admin! Initializing page.");
                initializeApp();
                } else {
                console.log("Access Denied: User is not an admin. Redirecting...");
                window.location.href = '/index.html';
            }
        } else {
            console.log("User not logged in. Redirecting...");
            window.location.href = '/auth.html';
        }
    });

    // --- Helper Functions ---
    const showStatus = (element, message, isError = false) => {
        element.textContent = message;
        element.style.color = isError ? '#ef4444' : '#16a34a';
        setTimeout(() => element.textContent = '', 4000);
    };

    const uploadImage = (file, onProgress) => {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error("No file selected for upload."));
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', UPLOAD_PRESET);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', CLOUDINARY_URL, true);
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentage = Math.round((event.loaded / event.total) * 100);
                    onProgress(percentage);
                }
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const data = JSON.parse(xhr.responseText);
                    if (data.error) return reject(new Error(`Cloudinary Error: ${data.error.message}`));
                    if (!data.secure_url && !data.public_id) return reject(new Error("Cloudinary did not return a URL or public_id."));
                    // Build optimized URL if public_id is present
                    const publicId = data.public_id || null;
                    const optimized = publicId ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_auto,w_800/${encodeURIComponent(publicId)}.png` : data.secure_url;
                    resolve({ secure_url: data.secure_url, public_id: publicId, optimizedUrl: optimized });
                } else {
                    reject(new Error(`Upload failed with status: ${xhr.status}`));
                }
            };
            xhr.onerror = () => reject(new Error("Network error during upload."));
            xhr.send(formData);
        });
    };

    const showLoadingState = (button, textContent = '') => {
        button.disabled = true;
        const span = button.querySelector('span');
        if (span) {
            span.innerHTML = spinnerSVG;
            if(textContent) span.insertAdjacentText('beforeend', ` ${textContent}`);
        } else {
            button.innerHTML = spinnerSVG;
        }
    };

    const hideLoadingState = (button, originalText) => {
        button.disabled = false;
        const span = button.querySelector('span');
        if(span) {
            span.innerHTML = originalText;
        } else {
            button.innerHTML = originalText;
        }
    };

    // --- Main Application Logic ---
    const initializeApp = async () => {
        showLoader('Initializing admin...');
        const subjectSelectForQuiz = document.getElementById('subject-select-for-quiz');
        const subjectSelectForQuestion = document.getElementById('subject-select-for-question');
        const quizSelectForQuestion = document.getElementById('quiz-select-for-question');

        const populateSubjectsDropdowns = async () => {
            showLoader('Loading subjects...');
            try {
                const subjectsSnapshot = await getDocs(collection(db, 'subjects'));
                const options = subjectsSnapshot.docs.map(doc => `<option value="${doc.id}">${doc.data().name}</option>`).join('');
                const initialOption = '<option value="">Select a subject</option>';
                subjectSelectForQuiz.innerHTML = initialOption + options;
                subjectSelectForQuestion.innerHTML = initialOption + options;
            } catch (error) { console.error("Could not populate subjects:", error); }
            finally { hideLoader(); }
        };
        await populateSubjectsDropdowns();

        // --- Event Listeners ---
        
        // 1. Add Subject Form
        const addSubjectForm = document.getElementById('add-subject-form');
        const addSubjectBtn = document.getElementById('add-subject-btn');
        const addSubjectBtnText = addSubjectBtn.querySelector('span');
        const addSubjectProgressBar = document.getElementById('add-subject-progress');
        const originalBtnText = addSubjectBtnText.textContent;

        addSubjectForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const statusEl = document.getElementById('subject-status');
            
            addSubjectBtn.disabled = true;
            addSubjectBtn.style.backgroundColor = '#d1d5db';
            addSubjectBtnText.textContent = 'Uploading (0%)';
            addSubjectProgressBar.style.width = '0%';
            
            let progress1 = 0, progress2 = 0;
            const updateCombinedProgress = () => {
                const combinedPercentage = Math.round((progress1 + progress2) / 2);
                addSubjectProgressBar.style.width = `${combinedPercentage}%`;
                addSubjectBtnText.textContent = `Uploading (${combinedPercentage}%)`;
            };

            try {
                showLoader('Uploading subject...');
                const name = document.getElementById('subject-name').value;
                const smallCoverFile = document.getElementById('small-cover').files[0];
                const largeCoverFile = document.getElementById('large-cover').files[0];
                if (!name || !smallCoverFile || !largeCoverFile) throw new Error("Please fill out all fields.");

                const [smallRes, largeRes] = await Promise.all([
                    uploadImage(smallCoverFile, (p) => { progress1 = p; updateCombinedProgress(); }),
                    uploadImage(largeCoverFile, (p) => { progress2 = p; updateCombinedProgress(); })
                ]);
                
                const smallCoverUrl = smallRes.optimizedUrl || smallRes.secure_url;
                const largeCoverUrl = largeRes.optimizedUrl || largeRes.secure_url;

                addSubjectBtnText.textContent = 'Saving...';
                await addDoc(collection(db, 'subjects'), { name, smallCoverUrl, largeCoverUrl, createdAt: new Date() });
                
                showStatus(statusEl, "Subject added successfully!");
                addSubjectForm.reset();
                await populateSubjectsDropdowns();
            } catch (error) {
                console.error("Error adding subject:", error);
                showStatus(statusEl, `Error: ${error.message}`, true);
            } finally {
                addSubjectBtn.disabled = false;
                addSubjectBtn.style.backgroundColor = '';
                addSubjectBtnText.textContent = originalBtnText;
                addSubjectProgressBar.style.width = '0%';
                hideLoader();
            }
        });

        // 2. Add Quiz Form
        const addQuizForm = document.getElementById('add-quiz-form');
        const addQuizBtn = addQuizForm.querySelector('button');
        const addQuizBtnText = addQuizBtn.textContent;
        addQuizForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoadingState(addQuizBtn);
            const statusEl = document.getElementById('quiz-status');
            try {
                showLoader('Saving quiz...');
                const subjectId = subjectSelectForQuiz.value;
                if (!subjectId) throw new Error("Please select a subject.");
                const quizName = document.getElementById('quiz-name').value;
                const quizCollectionRef = collection(db, 'subjects', subjectId, 'quizzes');
                await addDoc(quizCollectionRef, { name: quizName, createdAt: new Date() });
                showStatus(statusEl, "Quiz added successfully!");
                addQuizForm.reset();
            } catch (error) {
                console.error("Error adding quiz:", error);
                showStatus(statusEl, `Error: ${error.message}`, true);
            } finally {
                hideLoadingState(addQuizBtn, addQuizBtnText);
                hideLoader();
            }
        });

        // 3. Dynamic Quiz Loading
        subjectSelectForQuestion.addEventListener('change', async (e) => {
            const subjectId = e.target.value;
            quizSelectForQuestion.innerHTML = '<option value="">Select a subject first</option>';
            if (!subjectId) return;
            showLoader('Loading quizzes...');
            quizSelectForQuestion.innerHTML = '<option value="">Loading quizzes...</option>';
            const quizzesSnapshot = await getDocs(collection(db, 'subjects', subjectId, 'quizzes'));
            const quizOptions = quizzesSnapshot.docs.map(doc => `<option value="${doc.id}">${doc.data().name}</option>`).join('');
            quizSelectForQuestion.innerHTML = '<option value="">Select a quiz</option>' + quizOptions;
            hideLoader();
        });

        // 4. Add Questions via JSON
        const addQuestionForm = document.getElementById('add-question-form');
        const addQuestionBtn = addQuestionForm.querySelector('button');
        const addQuestionBtnText = addQuestionBtn.textContent;
        addQuestionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoadingState(addQuestionBtn);
            const statusEl = document.getElementById('question-status');
            try {
                showLoader('Uploading questions...');
                const subjectId = subjectSelectForQuestion.value;
                const quizId = quizSelectForQuestion.value;
                const fileInput = document.getElementById('questions-json-file');
                if (!subjectId || !quizId) throw new Error("Please select a subject and a quiz.");
                if (fileInput.files.length === 0) throw new Error("Please select a JSON file.");
                const file = fileInput.files[0];
                const fileContent = await file.text();
                const parsed = JSON.parse(fileContent);
                // Allow either a root array or an object with a `questions` array
                const questions = Array.isArray(parsed) ? parsed : parsed.questions;
                if (!Array.isArray(questions)) throw new Error("JSON file must contain an array of questions (either a root array or { questions: [...] }).");

                const batch = writeBatch(db);
                const questionCollectionRef = collection(db, 'subjects', subjectId, 'quizzes', quizId, 'questions');
                questions.forEach((rawQ, idx) => {
                    // Normalize field names: support { question, options, correctAnswer } as well as { text, options, correctIndex }
                    const text = rawQ.text ?? rawQ.question ?? rawQ.prompt ?? '';
                    const options = rawQ.options ?? rawQ.choices ?? [];
                    const correctIndex = typeof rawQ.correctIndex === 'number'
                        ? rawQ.correctIndex
                        : (typeof rawQ.correctAnswer === 'number' ? rawQ.correctAnswer : (typeof rawQ.correct === 'number' ? rawQ.correct : null));

                    if (!text || !Array.isArray(options) || options.length !== 4 || typeof correctIndex !== 'number' || correctIndex < 0 || correctIndex >= options.length) {
                        throw new Error(`Invalid format for question at index ${idx}: must have text/question, options (array of 4), and correctIndex/correctAnswer as a number within range.`);
                    }

                    const normalized = {
                        text,
                        options,
                        correctIndex,
                        createdAt: new Date()
                    };

                    batch.set(doc(questionCollectionRef), normalized);
                });
                await batch.commit();
                showStatus(statusEl, `Successfully uploaded ${questions.length} questions!`);
                addQuestionForm.reset();
            } catch (error) {
                console.error("Error uploading questions:", error);
                showStatus(statusEl, `Error: ${error.message}`, true);
            } finally {
                hideLoadingState(addQuestionBtn, addQuestionBtnText);
                hideLoader();
            }
        });
        hideLoader();
    };
});