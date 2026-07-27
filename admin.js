import { auth, db, DEFAULT_PARTICIPANTS } from './config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, deleteDoc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let votesData = [];
let currentSessionId = null;
let revealMode = false;
let previousVoteCount = 0;
let votesUnsubscribe = null;
let activeModalVoteId = null;

// Проверка авторизации
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

window.openVoting = async function(minutes) {
    const newSessionId = 'session_' + Date.now();
    const endsAt = minutes > 0 ? new Date(Date.now() + minutes * 60000) : null;
    
    await setDoc(doc(db, "system", "voting_state"), {
        status: 'open',
        endsAt: endsAt,
        sessionId: newSessionId,
        openedAt: new Date()
    });
};

window.closeVoting = async function() {
    await setDoc(doc(db, "system", "voting_state"), {
        status: 'closed',
        endsAt: null,
        sessionId: currentSessionId
    });
};

window.revealResults = function() {
    revealMode = true;
    renderMatrix();
};

window.closeVoteModal = function() {
    document.getElementById('vote-modal').classList.add('hidden');
    activeModalVoteId = null;
};

// Функция открытия детального просмотра голоса
window.inspectVote = function(voteId) {
    const vote = votesData.find(v => v.id === voteId);
    if (!vote) return;

    activeModalVoteId = voteId;
    document.getElementById('modal-voter-name').innerText = `Голос от: ${vote.voterName || 'Аноним'}`;
    
    const detailsEl = document.getElementById('modal-voter-details');
    detailsEl.innerHTML = `
        <div>Тип голоса: <strong>${vote.isNational ? 'Национальный (' + vote.representative + ')' : 'Публичный'}</strong></div>
        <div>Время: <strong>${vote.timestamp ? new Date(vote.timestamp.toMillis()).toLocaleTimeString() : 'Только что'}</strong></div>
    `;

    const allocEl = document.getElementById('modal-allocations');
    allocEl.innerHTML = Object.entries(vote.allocations || {}).map(([pts, pId]) => {
        const participant = DEFAULT_PARTICIPANTS.find(p => p.id === pId);
        return `
            <div class="flex items-center justify-between bg-[#15092b] border border-purple-500/20 px-3 py-1.5 font-mono text-xs">
                <span class="text-white">${participant ? participant.name : pId}</span>
                <span class="font-bold text-yellow-400">+${pts} б.</span>
            </div>
        `;
    }).join('');

    document.getElementById('reset-vote-btn').onclick = () => resetVote(voteId);
    document.getElementById('vote-modal').classList.remove('hidden');
};

// Обнуление голоса администратором
async function resetVote(voteId) {
    if (!confirm("Вы уверены, что хотите обнулить этот голос? Пользователь сможет проголосовать повторно.")) return;
    
    try {
        await deleteDoc(doc(db, "votes", voteId));
        closeVoteModal();
    } catch (e) {
        alert("Ошибка при обнулении голоса: " + e.message);
    }
}

function showNotification(voterName) {
    const container = document.getElementById('toast-container');
    container.innerHTML = `
        <div class="bg-green-500/20 border border-green-500/40 text-green-300 font-bold text-xs uppercase tracking-wider px-3 py-1.5 flex items-center gap-2 animate-bounce">
            ✓ Новый голос от: ${voterName || 'Аноним'}
        </div>
    `;
    setTimeout(() => { container.innerHTML = ''; }, 3500);
}

function initDashboardListeners() {
    onSnapshot(doc(db, "system", "voting_state"), (docSnap) => {
        const data = docSnap.exists() ? docSnap.data() : { status: 'closed' };
        const isLive = data.status === 'open' && (!data.endsAt || data.endsAt.toMillis() > Date.now());

        if (data.sessionId && data.sessionId !== currentSessionId) {
            currentSessionId = data.sessionId;
            revealMode = false;
            subscribeToSessionVotes(currentSessionId);
        }

        const ind = document.getElementById('live-indicator');
        if (isLive) {
            ind.className = "flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20";
            ind.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Открыто`;
            document.getElementById('open-controls').classList.add('hidden');
            document.getElementById('close-controls').classList.remove('hidden');
        } else {
            ind.className = "flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20";
            ind.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> Закрыто`;
            document.getElementById('open-controls').classList.remove('hidden');
            document.getElementById('close-controls').classList.add('hidden');
        }

        const timerEl = document.getElementById('timer-display');
        if (data.endsAt) {
            const diff = Math.max(0, Math.floor((data.endsAt.toMillis() - Date.now()) / 1000));
            const m = Math.floor(diff / 60);
            const s = diff % 60;
            timerEl.innerText = `Голосование завершится через: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        } else {
            timerEl.innerText = isLive ? "Голосование завершится через: Без лимита" : "Голосование завершится через: --:--";
        }
    });
}

function subscribeToSessionVotes(sessionId) {
    if (votesUnsubscribe) votesUnsubscribe();

    const q = query(collection(db, "votes"), where("sessionId", "==", sessionId));
    
    votesUnsubscribe = onSnapshot(q, (snapshot) => {
        votesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (votesData.length > previousVoteCount && previousVoteCount !== 0) {
            const latestVote = votesData[votesData.length - 1];
            showNotification(latestVote?.voterName);
        }
        previousVoteCount = votesData.length;

        document.getElementById('vote-count').innerText = `${votesData.length}`;
        renderVotersList();
        renderMatrix();
    });
}

function renderVotersList() {
    const listEl = document.getElementById('voters-list');
    if (!listEl) return;
    
    if (votesData.length === 0) {
        listEl.innerHTML = `<span class="text-[10px] text-slate-500 italic">Голосов пока нет</span>`;
        return;
    }

    listEl.innerHTML = votesData.map(v => `
        <button onclick="inspectVote('${v.id}')" class="bg-[#15092b] hover:bg-purple-900/50 border border-purple-500/20 text-purple-200 text-[10px] font-medium px-2.5 py-1 rounded-none flex items-center gap-1.5 transition">
            <span>👤 ${v.voterName || 'Аноним'}</span>
            ${v.isNational ? `<span class="text-[9px] bg-purple-800 text-yellow-300 px-1 font-bold">${v.representative}</span>` : ''}
        </button>
    `).join('');
}

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
