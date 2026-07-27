// Firebase Web SDK v10 (Modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Insert your real Firebase project configuration here
const firebaseConfig = {
    apiKey: "AIzaSyAZ_vp4IovHZBON0GxSd9lcWt5TFC2mOQw",
    authDomain: "voting-91412.firebaseapp.com",
    projectId: "voting-91412",
    storageBucket: "voting-91412.firebasestorage.app",
    messagingSenderId: "420998212853",
    appId: "1:420998212853:web:4d16f7a9825cb0b76229bc"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Application Constants
export const VOTING_POINTS = [12, 10, 8, 7, 6, 5, 4, 3];
export const DEFAULT_PARTICIPANTS = [
    { id: 'p1', name: 'Number 1' },
    { id: 'p2', name: 'Number 2' },
    { id: 'p3', name: 'Number 3' },
    { id: 'p4', name: 'Number 4' },
    { id: 'p5', name: 'Number 5' },
    { id: 'p6', name: 'Number 6' },
    { id: 'p7', name: 'Number 7' },
    { id: 'p8', name: 'Number 8' }
];