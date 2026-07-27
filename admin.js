import { auth, db, VOTING_POINTS, DEFAULT_PARTICIPANTS } from './config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, onSnapshot, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let votesData = [];
let revealMode = false;
let previousVoteCount = 0;

// Auth Listeners
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-panel').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        initDashboardListeners();
    } else {
        document.getElementById('auth-panel').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
    }
});

// Login Execution
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const errEl = document.getElementById('auth-error');
    try {
        errEl.classList.add('hidden');
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        errEl.innerText = err.message;
        errEl.classList.remove('hidden');
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// Global Actions Exposure
window.openVoting = async function(minutes) {
    const endsAt = minutes > 0 ? new Date(Date.now() + minutes * 60000) : null;
    await setDoc(doc(db, "system", "voting_state"), {
        status: 'open',
        endsAt: endsAt,
        openedAt: new Date()
    });
};

window.closeVoting = async function() {
    await setDoc(doc(db, "system", "voting_state"), {
        status: 'closed',
        endsAt: null
    });
};

window.revealResults = function() {
    revealMode = true;
    renderMatrix();
};

function showNotification() {
    const container = document.getElementById('toast-container');
    container.innerHTML = `
        <div class="bg-green-500/20 border border-green-500/40 text-green-300 font-bold text-xs uppercase tracking-wider px-4 py-2 flex items-center gap-2 animate-bounce">
            ✓ New vote received
        </div>
    `;
    setTimeout(() => { container.innerHTML = ''; }, 3500);
}

// Dashboard Synchronization
function initDashboardListeners() {
    // 1. Voting State Listener
    onSnapshot(doc(db, "system", "voting_state"), (docSnap) => {
        const data = docSnap.exists() ? docSnap.data() : { status: 'closed' };
        const isLive = data.status === 'open' && (!data.endsAt || data.endsAt.toMillis() > Date.now());

        const ind = document.getElementById('live-indicator');
        if (isLive) {
            ind.className = "flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20";
            ind.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Open`;
            document.getElementById('open-controls').classList.add('hidden');
            document.getElementById('close-controls').classList.remove('hidden');
        } else {
            ind.className = "flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20";
            ind.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> Closed`;
            document.getElementById('open-controls').classList.remove('hidden');
            document.getElementById('close-controls').classList.add('hidden');
        }

        const timerEl = document.getElementById('timer-display');
        if (data.endsAt) {
            const diff = Math.max(0, Math.floor((data.endsAt.toMillis() - Date.now()) / 1000));
            const m = Math.floor(diff / 60);
            const s = diff % 60;
            timerEl.innerText = `Voting ends in: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        } else {
            timerEl.innerText = isLive ? "Voting ends in: Unlimited" : "Voting ends in: --:--";
        }
    });

    // 2. Real-time Votes Listener
    const q = query(collection(db, "votes"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        votesData = snapshot.docs.map(doc => doc.data());
        
        if (votesData.length > previousVoteCount && previousVoteCount !== 0) {
            showNotification();
        }
        previousVoteCount = votesData.length;

        document.getElementById('vote-count').innerText = `${votesData.length}`;
        renderMatrix();
    });
}

// Matrix Calculation
function renderMatrix() {
    const tbody = document.getElementById('matrix-body');
    tbody.innerHTML = '';

    DEFAULT_PARTICIPANTS.forEach(p => {
        const pointCounts = { 12: 0, 10: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0 };
        let grandTotal = 0;

        votesData.forEach(vote => {
            if (vote.allocations) {
                for (const [pts, participantId] of Object.entries(vote.allocations)) {
                    if (participantId === p.id) {
                        pointCounts[pts] = (pointCounts[pts] || 0) + 1;
                        grandTotal += parseInt(pts, 10);
                    }
                }
            }
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-3 font-bold text-white">${p.name}</td>
            <td class="py-3">${pointCounts[12]}</td>
            <td class="py-3">${pointCounts[10]}</td>
            <td class="py-3">${pointCounts[8]}</td>
            <td class="py-3">${pointCounts[7]}</td>
            <td class="py-3">${pointCounts[6]}</td>
            <td class="py-3">${pointCounts[5]}</td>
            <td class="py-3">${pointCounts[4]}</td>
            <td class="py-3">${pointCounts[3]}</td>
            <td class="py-3 font-black text-yellow-400">${revealMode ? grandTotal : '***'}</td>
        `;
        tbody.appendChild(tr);
    });
}