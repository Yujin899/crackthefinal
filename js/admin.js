// admin.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, addDoc, writeBatch, updateDoc, collectionGroup, where, query } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
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
                initializeAlertSystem();
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

    // --- Alert Management Functions ---
    const initializeAlertSystem = async () => {
        const alertForm = document.getElementById('alert-form');
        const activeAlertsList = document.getElementById('active-alerts');

        // If UI is not present, skip initializing alerts gracefully
        if (!alertForm || !activeAlertsList) {
            console.warn('Alert UI not found on this page. Skipping alert system initialization.');
            return;
        }

        // Load existing alerts
        const loadActiveAlerts = async () => {
            const alertsSnapshot = await getDocs(
                query(collection(db, 'globalAlerts'), where('active', '==', true))
            );

            activeAlertsList.innerHTML = '';
            alertsSnapshot.forEach(doc => {
                const alert = doc.data();
                        const alertEl = document.createElement('div');
                        const colorCls = getAlertColorClass(alert.type);
                        alertEl.className = `p-4 rounded-lg border ${colorCls}`;

                        const seenCount = alert.seenBy ? Object.keys(alert.seenBy).length : 0;

                        alertEl.innerHTML = `
                            <div class="flex justify-between items-start">
                                <div>
                                    <h4 class="font-semibold text-gray-900 dark:text-gray-100">${alert.title}</h4>
                                    <p class="text-sm mt-1 text-gray-700 dark:text-gray-300">${alert.message}</p>
                                    <div class="text-xs mt-2 text-gray-600 dark:text-gray-400">
                                        Published: ${new Date(alert.createdAt).toLocaleString()}
                                        ${alert.expiresAt ? `<br>Expires: ${new Date(alert.expiresAt).toLocaleString()}` : ''}
                                        <br>Seen by ${seenCount} users
                                    </div>
                                </div>
                                <button class="delete-alert text-red-600 hover:text-red-400 dark:text-red-300" data-alert-id="${doc.id}" aria-label="Delete alert">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        `;
                
                // Add delete handler
                alertEl.querySelector('.delete-alert').addEventListener('click', async () => {
                    if (confirm('Are you sure you want to delete this alert?')) {
                        await updateDoc(doc(db, 'globalAlerts', doc.id), { active: false });
                        loadActiveAlerts();
                    }
                });
                
                activeAlertsList.appendChild(alertEl);
            });
        };

        // Handle form submission
        alertForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = alertForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = spinnerSVG;
            
            try {
                const alertData = {
                    title: alertForm.querySelector('#alert-title').value,
                    message: alertForm.querySelector('#alert-message').value,
                    type: alertForm.querySelector('#alert-type').value,
                    createdAt: Date.now(),
                    active: true,
                    seenBy: {}
                };
                
                let expiryDate = alertForm.querySelector('#alert-expiry').value;
                if (!expiryDate) {
                    // Try fallback date/time fields
                    const datePart = document.getElementById('alert-expiry-date')?.value || '';
                    const timePart = document.getElementById('alert-expiry-time')?.value || '';
                    if (datePart) {
                        expiryDate = timePart ? `${datePart}T${timePart}` : `${datePart}T00:00`;
                    }
                }
                if (expiryDate) {
                    alertData.expiresAt = new Date(expiryDate).getTime();
                }
                
                await addDoc(collection(db, 'globalAlerts'), alertData);
                alertForm.reset();
                await loadActiveAlerts();
                showStatus(submitBtn, 'Alert published successfully!');
                
            } catch (error) {
                console.error('Error publishing alert:', error);
                showStatus(submitBtn, 'Failed to publish alert', true);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Publish Alert';
            }
        });

        // Load initial alerts
        await loadActiveAlerts();
    };

    const getAlertColorClass = (type) => {
        // Return classes that cover light and dark themes
        switch (type) {
            case 'success': return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200';
            case 'error': return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900 dark:border-red-700 dark:text-red-200';
            case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-200';
            default: return 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200';
        }
    };

    const uploadImage = (file, onProgress, opts = {}) => {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error("No file selected for upload."));
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', UPLOAD_PRESET);
            if (opts.publicId) formData.append('public_id', opts.publicId);
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
                    const publicId = data.public_id || opts.publicId || null;
                    // Allow caller to request a target width for the optimized delivery URL (defaults to 800)
                    const targetWidth = opts.width || 800;
                    const optimized = publicId ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_auto,w_${targetWidth}/${encodeURIComponent(publicId)}.png` : data.secure_url;
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
                    if (subjectSelectForQuiz) subjectSelectForQuiz.innerHTML = initialOption + options;
                    if (subjectSelectForQuestion) subjectSelectForQuestion.innerHTML = initialOption + options;
                } catch (error) { console.error("Could not populate subjects:", error); }
            finally { hideLoader(); }
        };
        await populateSubjectsDropdowns();

    // --- Subjects management UI ---
    const subjectsManageList = document.getElementById('subjects-manage-list');
        const populateSubjectsManage = async () => {
            subjectsManageList.innerHTML = '<p class="text-gray-500">Loading subjects...</p>';
            try {
                const snap = await getDocs(collection(db, 'subjects'));
                if (snap.empty) {
                    subjectsManageList.innerHTML = '<p class="text-gray-500">No subjects yet.</p>';
                    return;
                }
                const rows = snap.docs.map(doc => {
                    const d = doc.data();
                    return `
                            <div class="flex items-center gap-4 p-3 border-b">
                                <div class="w-20 h-12 overflow-hidden rounded bg-gray-100"><img src="${d.smallCoverUrl||''}" class="w-full h-full object-cover" loading="lazy"></div>
                                <div class="flex-1">
                                    <div class="font-semibold">${d.name}</div>
                                    <div class="text-sm text-gray-500">id: ${doc.id}</div>
                                </div>
                                <div class="flex gap-2">
                                    <label class="btn-replace px-3 py-1 bg-yellow-500 text-white rounded cursor-pointer">Replace Small
                                        <input type="file" accept="image/*" data-subject-id="${doc.id}" data-target="small" class="replace-input-small hidden">
                                    </label>
                                    <label class="btn-replace px-3 py-1 bg-green-600 text-white rounded cursor-pointer">Replace Large
                                        <input type="file" accept="image/*" data-subject-id="${doc.id}" data-target="large" class="replace-input-large hidden">
                                    </label>
                                    <label class="btn-replace px-3 py-1 bg-blue-500 text-white rounded cursor-pointer">Replace Both
                                        <input type="file" accept="image/*" data-subject-id="${doc.id}" class="replace-input-both hidden">
                                    </label>
                                </div>
                            </div>
                        `;
                }).join('\n');
                subjectsManageList.innerHTML = rows;
                    // wire replace inputs - small only
                    document.querySelectorAll('.replace-input-small').forEach(input => {
                        input.addEventListener('change', async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const subjectId = e.target.getAttribute('data-subject-id');
                            const smallPublicId = `subject_small_${subjectId}`;
                            try {
                                showLoader('Uploading small cover...');
                                const smallRes = await uploadImage(file, () => {}, { publicId: smallPublicId, width: 400 });
                                const smallCoverUrl = smallRes.optimizedUrl || smallRes.secure_url;
                                await updateDoc(doc(db, 'subjects', subjectId), { smallCoverUrl });
                                await populateSubjectsManage();
                                showStatus(document.getElementById('subject-status') || document.body, 'Small cover updated');
                            } catch (err) {
                                console.error('Error replacing small cover:', err);
                                showStatus(document.getElementById('subject-status') || document.body, 'Error updating small cover', true);
                            } finally {
                                hideLoader();
                            }
                        });
                    });

                    // wire replace inputs - large only
                    document.querySelectorAll('.replace-input-large').forEach(input => {
                        input.addEventListener('change', async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const subjectId = e.target.getAttribute('data-subject-id');
                            const largePublicId = `subject_large_${subjectId}`;
                            try {
                                showLoader('Uploading large cover...');
                                const largeRes = await uploadImage(file, () => {}, { publicId: largePublicId, width: 1200 });
                                const largeCoverUrl = largeRes.optimizedUrl || largeRes.secure_url;
                                await updateDoc(doc(db, 'subjects', subjectId), { largeCoverUrl });
                                await populateSubjectsManage();
                                showStatus(document.getElementById('subject-status') || document.body, 'Large cover updated');
                            } catch (err) {
                                console.error('Error replacing large cover:', err);
                                showStatus(document.getElementById('subject-status') || document.body, 'Error updating large cover', true);
                            } finally {
                                hideLoader();
                            }
                        });
                    });

                    // wire replace inputs - both (legacy behavior)
                    document.querySelectorAll('.replace-input-both').forEach(input => {
                        input.addEventListener('change', async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const subjectId = e.target.getAttribute('data-subject-id');
                            const smallPublicId = `subject_small_${subjectId}`;
                            const largePublicId = `subject_large_${subjectId}`;
                            try {
                                showLoader('Uploading new covers...');
                                // Upload twice: small and large variants (we'll upload same file but store urls under different public ids)
                                const [smallRes, largeRes] = await Promise.all([
                                    uploadImage(file, () => {}, { publicId: smallPublicId, width: 400 }),
                                    uploadImage(file, () => {}, { publicId: largePublicId, width: 1200 })
                                ]);
                                const smallCoverUrl = smallRes.optimizedUrl || smallRes.secure_url;
                                const largeCoverUrl = largeRes.optimizedUrl || largeRes.secure_url;
                                await updateDoc(doc(db, 'subjects', subjectId), { smallCoverUrl, largeCoverUrl });
                                await populateSubjectsManage();
                                showStatus(document.getElementById('subject-status') || document.body, 'Covers updated');
                            } catch (err) {
                                console.error('Error replacing covers:', err);
                                showStatus(document.getElementById('subject-status') || document.body, 'Error updating covers', true);
                            } finally {
                                hideLoader();
                            }
                        });
                    });
            } catch (err) {
                subjectsManageList.innerHTML = '<p class="text-red-500">Error loading subjects.</p>';
            }
        };
        if (subjectsManageList) {
            await populateSubjectsManage();
        } else {
            console.warn('Subjects manage list UI not present; skipping populateSubjectsManage.');
        }

        // --- Event Listeners ---
        
        // 1. Add Subject Form
        const addSubjectForm = document.getElementById('add-subject-form');
        if (addSubjectForm) {
            const addSubjectBtn = document.getElementById('add-subject-btn');
            const addSubjectBtnText = addSubjectBtn ? addSubjectBtn.querySelector('span') : null;
            const addSubjectProgressBar = document.getElementById('add-subject-progress');
            const originalBtnText = addSubjectBtnText ? addSubjectBtnText.textContent : '';

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
        }

        // 2. Add Quiz Form
        const addQuizForm = document.getElementById('add-quiz-form');
        if (addQuizForm) {
            const addQuizBtn = addQuizForm.querySelector('button');
            const addQuizBtnText = addQuizBtn ? addQuizBtn.textContent : '';
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
                const newQuizRef = await addDoc(quizCollectionRef, { name: quizName, createdAt: new Date() });
                // Notifications removed: no subscriber notifications are sent when quizzes are added.
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
        }

        // 3. Dynamic Quiz Loading
        if (subjectSelectForQuestion) {
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
        }

        // 4. Add Questions via JSON
        const addQuestionForm = document.getElementById('add-question-form');
        if (addQuestionForm) {
            const addQuestionBtn = addQuestionForm.querySelector('button');
            const addQuestionBtnText = addQuestionBtn ? addQuestionBtn.textContent : '';
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
        }
        hideLoader();
    };

    // Notifications feature removed from admin UI.
});