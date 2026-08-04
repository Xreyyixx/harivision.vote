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
    { id: 'p1', name: '01 Монополия' },
    { id: 'p2', name: '02 Ride' },
    { id: 'p3', name: '03 Never Let You Go' },
    { id: 'p4', name: '04 Bangaranga' },
    { id: 'p5', name: '05 Вера' },
    { id: 'p6', name: '06 Welcome To The Black Parade' },
    { id: 'p7', name: '07 Euphoria' },
    { id: 'p8', name: '08 You Are The Only One' }
];
