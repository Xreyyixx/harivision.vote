import { db, VOTING_POINTS, DEFAULT_PARTICIPANTS } from './config.js';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Global State
let systemState = { status: 'closed', endsAt: null };
let currentSubPage = 'home'; // 'home' | 'recap' | 'voting'
let userVotes = {}; 
let hasSubmittedVote = localStorage.getItem('harivision_voted') === 'true';
let timerInterval = null;

// Ambient Canvas Animation
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let stripes = [];

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class PurpleStripe {
    constructor() { this.reset(); this.x = Math.random() * canvas.width; }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y1 = -300; this.y2 = canvas.height + 300;
        this.width = Math.random() * 100 + 50; 
        this.offset = Math.random() * Math.PI * 2;
        this.alpha = Math.random() * 0.05 + 0.03; 
    }
    update() {
        this.offset += 0.0015;
        this.x += Math.sin(this.offset) * 0.2;
        if (this.x < -this.width) this.x = canvas.width + this.width;
        if (this.x > canvas.width + this.width) this.x = -this.width;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        const grad = ctx.createLinearGradient(this.x, 0, this.x + this.width, canvas.height);
        grad.addColorStop(0, '#1e0b36'); grad.addColorStop(0.3, '#4c1d95');
        grad.addColorStop(0.7, '#6d28d9'); grad.addColorStop(1, '#2e105e');
        ctx.strokeStyle = grad; ctx.lineWidth = this.width;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y1);
        ctx.bezierCurveTo(this.x + Math.sin(this.offset) * 100, canvas.height * 0.3, this.x - Math.cos(this.offset) * 100, canvas.height * 0.7, this.x, this.y2);
        ctx.stroke(); ctx.restore();
    }
}
for (let i = 0; i < 16; i++) stripes.push(new PurpleStripe());
function animateBg() {
    ctx.fillStyle = '#05020c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    stripes.forEach(s => { s.update(); s.draw(); });
    requestAnimationFrame(animateBg);
}
animateBg();

// Firestore Realtime Listener
onSnapshot(doc(db, "system", "voting_state"), (docSnap) => {
    if (docSnap.exists()) {
        systemState = docSnap.data();
    } else {
        systemState = { status: 'closed', endsAt: null };
    }
    render();
});

// Timer formatting
function formatTimer() {
    if (!systemState.endsAt) return "";
    const now = Date.now();
    const diff = systemState.endsAt.toMillis() - now;
    if (diff <= 0) return "00:00";
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startTimerLoop() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const el = document.getElementById('voting-timer');
        if (el) el.innerText = formatTimer();
    }, 1000);
}

// Global exposure for event handlers
window.assignScore = function(points, participantId) {
    for (const p in userVotes) {
        if (userVotes[p] === participantId) delete userVotes[p];
    }
    if (participantId) userVotes[points] = participantId;
    else delete userVotes[points];
    render();
};

window.navigateTo = function(subPage) {
    currentSubPage = subPage;
    render();
};

window.submitVote = async function() {
    if (Object.keys(userVotes).length < VOTING_POINTS.length) {
        alert("Please assign all points before submitting.");
        return;
    }
    try {
        await addDoc(collection(db, "votes"), {
            allocations: userVotes,
            timestamp: serverTimestamp()
        });
        hasSubmittedVote = true;
        localStorage.setItem('harivision_voted', 'true');
        render();
    } catch (e) {
        alert("Error submitting vote: " + e.message);
    }
};

function getHeartSVG() {
    return `
        <svg class="w-10 h-10 inline-block heart-poly" viewBox="0 0 24 24" fill="none">
            <polygon points="12,6 7.5,3.5 3,7.5 12,12.5" fill="#f43f5e" opacity="0.9" />
            <polygon points="12,6 12,12.5 21,7.5 16.5,3.5" fill="#f43f5e" opacity="1.0" />
            <polygon points="3,7.5 12,21.5 12,12.5" fill="#f43f5e" opacity="0.7" />
            <polygon points="21,7.5 12,12.5 12,21.5" fill="#f43f5e" opacity="0.8" />
        </svg>
    `;
}

// UI State Controller
function render() {
    const card = document.getElementById('app-card');
    const isExpired = systemState.endsAt && (systemState.endsAt.toMillis() <= Date.now());

    // STATE 3: User Already Voted
    if (hasSubmittedVote) {
        card.innerHTML = `
            <div class="flex flex-col items-center text-center my-auto py-10 page-fade">
                <div class="w-20 h-20 bg-purple-900/40 border border-purple-500/40 flex items-center justify-center mb-6 text-yellow-400 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                    <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                </div>
                <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-widest mb-2">Thank you for your vote!</h2>
                <p class="text-sm text-purple-300 font-medium mb-8">Your vote has been successfully received.</p>
                <div class="border-t border-purple-500/10 pt-6 w-full max-w-sm">
                    <p class="text-xs text-slate-400 font-medium tracking-wide">Enjoy the rest of HariVision Performance Contest.</p>
                </div>
                <!-- Reserved Container for Personal Thank-You Video Stream -->
                <div id="personalized-video-container" class="mt-6 hidden"></div>
            </div>
        `;
        return;
    }

    // STATE 1: Voting Not Started or STATE 4: Closed
    if (systemState.status === 'closed' || (systemState.status === 'open' && isExpired)) {
        if (systemState.status === 'open' && isExpired) {
            card.innerHTML = `
                <div class="flex flex-col items-center text-center my-auto py-10 page-fade">
                    <h1 class="text-2xl md:text-3xl font-extrabold text-white uppercase tracking-widest mb-4">Voting is now closed.</h1>
                    <p class="text-sm text-purple-300 font-medium mb-2">Thank you for supporting HariVision Performance Contest.</p>
                    <p class="text-xs text-slate-400">Enjoy the show!</p>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="flex flex-col items-center text-center my-auto py-10 page-fade">
                    <div class="mb-6 animate-pulse">${getHeartSVG()}</div>
                    <h1 class="text-3xl md:text-4xl font-extrabold text-white uppercase tracking-widest mb-3">Please wait…</h1>
                    <p class="text-xs md:text-sm font-bold text-purple-400 uppercase tracking-widest">Voting will start in a few minutes.</p>
                </div>
            `;
        }
        return;
    }

    // STATE 2: Voting Open
    startTimerLoop();

    if (currentSubPage === 'home') {
        card.innerHTML = `
            <div class="flex flex-col items-center text-center my-auto py-8 page-fade">
                <div class="mb-6 scale-125">${getHeartSVG()}</div>
                <h1 class="text-2xl md:text-4xl font-extrabold uppercase tracking-widest text-white mb-2">HariVision</h1>
                <div class="text-xs md:text-sm font-bold text-purple-400 uppercase tracking-widest mb-8">Performance Contest | August 2026</div>
                <div class="w-full max-w-md bg-[#140b29] border border-purple-500/15 p-8 rounded-none">
                    <h2 class="text-lg font-bold text-white uppercase tracking-wider mb-2">Public Voting</h2>
                    <p class="text-xs text-slate-300 font-medium mb-8 leading-relaxed">Watch the recap as many times as you need before casting your vote.</p>
                    <button onclick="navigateTo('recap')" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs uppercase tracking-widest py-4 rounded-none transition shadow-lg">Start Voting</button>
                </div>
            </div>
        `;
    } else if (currentSubPage === 'recap') {
        card.innerHTML = `
            <div class="flex flex-col h-full justify-between gap-6 page-fade">
                <div class="flex items-center justify-between border-b border-purple-500/10 pb-4">
                    <h2 class="text-xl font-bold text-white uppercase tracking-wider">Recap Video</h2>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-purple-400">Duration: ~02:00</span>
                </div>
                <div class="relative w-full aspect-video bg-[#090414] border border-purple-500/20 flex flex-col items-center justify-center p-6 text-center group">
                    <div class="w-16 h-16 rounded-none bg-purple-900/40 border border-purple-500/30 flex items-center justify-center mb-4 text-purple-300">
                        <svg class="w-8 h-8 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                    <p class="text-sm md:text-base font-bold text-slate-200 uppercase tracking-wider mb-1">The recap video will appear here.</p>
                </div>
                <div class="flex flex-col md:flex-row gap-4 pt-2">
                    <button disabled class="flex-1 bg-[#15092b] border border-purple-500/20 text-purple-500/50 font-bold text-xs uppercase tracking-widest py-4 rounded-none cursor-not-allowed">Watch Recap</button>
                    <button onclick="navigateTo('voting')" class="flex-1 bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs uppercase tracking-widest py-4 rounded-none transition shadow-lg">Proceed to Voting</button>
                </div>
            </div>
        `;
    } else if (currentSubPage === 'voting') {
        const assignedParticipantIds = Object.values(userVotes);
        card.innerHTML = `
            <div class="flex flex-col gap-6 page-fade">
                <div class="flex items-center justify-between border-b border-purple-500/10 pb-4">
                    <h2 class="text-xl font-bold text-white uppercase tracking-wider">Allocate Points</h2>
                    <div class="flex items-center gap-4">
                        <span class="text-xs font-mono font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1">Voting closes in <span id="voting-timer">${formatTimer()}</span></span>
                        <button onclick="navigateTo('recap')" class="text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-white transition">↺ Recap</button>
                    </div>
                </div>
                <div class="grid grid-cols-1 gap-3 max-h-[360px] overflow-y-auto pr-1">
                    ${VOTING_POINTS.map(pts => {
                        const currentAssignedId = userVotes[pts] || '';
                        return `
                            <div class="flex items-center justify-between bg-[#15092b] border border-purple-500/15 p-3 md:p-4 rounded-none">
                                <div class="flex items-center gap-3 shrink-0">
                                    <span class="w-10 h-10 flex items-center justify-center font-mono font-black text-sm md:text-base ${pts >= 10 ? 'bg-yellow-500 text-slate-950' : 'bg-purple-900/80 text-purple-200 border border-purple-500/20'}">${pts}</span>
                                    <span class="text-xs font-bold uppercase tracking-wider text-purple-300">Points</span>
                                </div>
                                <select onchange="assignScore(${pts}, this.value)" class="bg-[#090414] border border-purple-500/20 text-white font-medium text-xs md:text-sm px-4 py-2.5 rounded-none focus:outline-none focus:border-purple-400 w-48 md:w-64 transition">
                                    <option value="">-- Select Participant --</option>
                                    ${DEFAULT_PARTICIPANTS.map(p => {
                                        if (assignedParticipantIds.includes(p.id) && currentAssignedId !== p.id) return '';
                                        return `<option value="${p.id}" ${currentAssignedId === p.id ? 'selected' : ''}>${p.name}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="pt-4 border-t border-purple-500/10">
                    <button onclick="submitVote()" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs uppercase tracking-widest py-4 rounded-none transition shadow-lg">Submit Vote</button>
                </div>
            </div>
        `;
    }
}