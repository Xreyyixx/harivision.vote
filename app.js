import { db, DEFAULT_PARTICIPANTS } from './config.js';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const COUNTRY_RESTRICTIONS = {
    "Родион": { blockedIds: ['p4', 'p7'], points: [12, 10, 8, 7, 6, 5] },
    "Орнелла": { blockedIds: ['p1', 'p6'], points: [12, 10, 8, 7, 6, 5] },
    "Виктория": { blockedIds: ['p3', 'p8'], points: [12, 10, 8, 7, 6, 5] },
    "Анна": { blockedIds: ['p2', 'p5'], points: [12, 10, 8, 7, 6, 5] }
};

let isNational = false;
let selectedRepresentative = null;
let systemState = { status: 'closed', endsAt: null, sessionId: null };
let currentSubPage = 'home';
let userVotes = {}; 
let userName = ''; 
let timerInterval = null;
let isRejectedByAdmin = false;

// Осенняя фон-анимация (Autumn Embers)
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let embers = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class AutumnEmber {
    constructor() {
        this.reset();
        this.y = Math.random() * canvas.height;
    }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = canvas.height + 20;
        this.size = Math.random() * 2.5 + 0.8;
        this.speedY = Math.random() * 0.6 + 0.2;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.alpha = Math.random() * 0.5 + 0.2;
        this.hue = Math.random() > 0.5 ? 28 : (Math.random() > 0.5 ? 345 : 12);
    }
    update() {
        this.y -= this.speedY;
        this.x += Math.sin(this.y * 0.01) * 0.3 + this.speedX;
        this.alpha -= 0.0015;

        if (this.y < -10 || this.alpha <= 0) {
            this.reset();
        }
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = `hsl(${this.hue}, 85%, 55%)`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsl(${this.hue}, 90%, 50%)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

for (let i = 0; i < 60; i++) {
    embers.push(new AutumnEmber());
}

function animateBg() {
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 50, canvas.width/2, canvas.height/2, canvas.width);
    grad.addColorStop(0, '#120408');
    grad.addColorStop(0.6, '#080204');
    grad.addColorStop(1, '#030102');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    embers.forEach(e => {
        e.update();
        e.draw();
    });

    requestAnimationFrame(animateBg);
}
animateBg();

export function initApp(options = {}) {
    isNational = options.isNationalMode || false;

    onSnapshot(doc(db, "system", "voting_state"), (docSnap) => {
        if (docSnap.exists()) {
            const newData = docSnap.data();
            
            const savedSession = localStorage.getItem('harivision_voted_session');
            if (newData.sessionId && savedSession !== newData.sessionId) {
                localStorage.removeItem('harivision_voted_session');
                localStorage.removeItem('harivision_rejected_flag');
                userVotes = {};
                isRejectedByAdmin = false;
            }

            if (localStorage.getItem('harivision_rejected_flag') === newData.sessionId) {
                isRejectedByAdmin = true;
            }

            systemState = newData;
        } else {
            systemState = { status: 'closed', endsAt: null, sessionId: null };
        }
        render();
    });
}

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

window.assignScore = function(points, participantId) {
    for (const p in userVotes) {
        if (userVotes[p] === participantId) delete userVotes[p];
    }
    if (participantId) userVotes[points] = participantId;
    else delete userVotes[points];
    render();
};

window.updateUserName = function(val) { userName = val; };

window.selectRepresentative = function(repName) {
    selectedRepresentative = repName;
    userVotes = {}; 
    render();
};

window.navigateTo = function(subPage) {
    currentSubPage = subPage;
    render();
};

window.dismissRejectionNotice = function() {
    isRejectedByAdmin = false;
    localStorage.removeItem('harivision_rejected_flag');
    render();
};

window.submitVote = async function() {
    const inputName = document.getElementById('voter-name-input');
    const nameValue = inputName ? inputName.value.trim() : userName.trim();

    if (!nameValue) {
        alert("Пожалуйста, введите ваше имя перед отправкой голоса.");
        return;
    }

    if (isNational && !selectedRepresentative) {
        alert("Пожалуйста, выберите представителя вашей страны.");
        return;
    }

    const requiredPoints = isNational ? COUNTRY_RESTRICTIONS[selectedRepresentative].points : [12, 10, 8, 7, 6, 5, 4, 3];
    if (Object.keys(userVotes).length < requiredPoints.length) {
        alert("Пожалуйста, распределите все доступные баллы.");
        return;
    }

    try {
        await addDoc(collection(db, "votes"), {
            voterName: nameValue,
            allocations: userVotes,
            sessionId: systemState.sessionId,
            isNational: isNational,
            representative: selectedRepresentative || null,
            timestamp: serverTimestamp()
        });
        
        localStorage.setItem('harivision_voted_session', systemState.sessionId);
        localStorage.removeItem('harivision_rejected_flag');
        render();
    } catch (e) {
        alert("Ошибка при отправке голоса: " + e.message);
    }
};

function getHeartSVG() {
    return `
        <svg class="w-10 h-10 inline-block heart-poly" viewBox="0 0 24 24" fill="none">
            <polygon points="12,6 7.5,3.5 3,7.5 12,12.5" fill="#f59e0b" opacity="0.9" />
            <polygon points="12,6 12,12.5 21,7.5 16.5,3.5" fill="#f59e0b" opacity="1.0" />
            <polygon points="3,7.5 12,21.5 12,12.5" fill="#f59e0b" opacity="0.7" />
            <polygon points="21,7.5 12,12.5 12,21.5" fill="#f59e0b" opacity="0.8" />
        </svg>
    `;
}

function render() {
    const card = document.getElementById('app-card');
    if (!card) return;

    const isExpired = systemState.endsAt && (systemState.endsAt.toMillis() <= Date.now());
    const hasVotedInCurrentSession = localStorage.getItem('harivision_voted_session') === systemState.sessionId && systemState.sessionId;

    if (isRejectedByAdmin) {
        card.innerHTML = `
            <div class="flex flex-col items-center text-center my-auto py-8 page-fade">
                <div class="w-16 h-16 bg-rose-950/60 border border-rose-500/40 flex items-center justify-center mb-4 text-rose-400 rounded-2xl">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <h2 class="text-xl md:text-2xl font-black text-white uppercase tracking-widest mb-2">Ваш голос был отклонен</h2>
                <p class="text-xs text-rose-300/80 font-medium mb-6 max-w-md">Система или администратор аннулировали ваш предыдущий голос. Вы можете проголосовать повторно.</p>
                <button onclick="dismissRejectionNotice()" class="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-widest py-3.5 px-8 transition rounded-xl shadow-lg">Понятно, проголосовать снова</button>
            </div>
        `;
        return;
    }

    if (hasVotedInCurrentSession) {
        const favoriteParticipantId = userVotes[12];
        const favoriteParticipant = DEFAULT_PARTICIPANTS.find(p => p.id === favoriteParticipantId);
        const thankYouVideoUrl = favoriteParticipant ? favoriteParticipant.videoUrl : null;

        card.innerHTML = `
            <div class="flex flex-col items-center text-center my-auto py-8 page-fade">
                <div class="w-16 h-16 bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.2)] rounded-2xl">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                </div>
                <h2 class="text-xl md:text-2xl font-black text-white uppercase tracking-widest mb-1">Спасибо за ваш голос!</h2>
                <p class="text-xs text-amber-200/80 font-medium mb-6">Ваш голос был успешно получен.</p>
                
                ${thankYouVideoUrl ? `
                    <div class="w-full max-w-md aspect-video bg-[#0a0305] border border-amber-500/30 mb-6 overflow-hidden shadow-2xl rounded-2xl">
                        <video class="w-full h-full object-cover" controls autoplay src="${thankYouVideoUrl}"></video>
                    </div>
                ` : ''}

                <div class="border-t border-amber-500/15 pt-4 w-full max-w-sm">
                    <p class="text-xs text-slate-400 font-medium tracking-wide">Наслаждайтесь остальной частью HariVision Performance Contest.</p>
                </div>
            </div>
        `;
        return;
    }

    if (systemState.status === 'closed' || (systemState.status === 'open' && isExpired)) {
        if (systemState.status === 'open' && isExpired) {
            card.innerHTML = `
                <div class="flex flex-col items-center text-center my-auto py-10 page-fade">
                    <h1 class="text-2xl md:text-3xl font-extrabold text-white uppercase tracking-widest mb-4">Голосование закрыто.</h1>
                    <p class="text-sm text-amber-200/80 font-medium mb-2">Спасибо за поддержку HariVision Performance Contest.</p>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="flex flex-col items-center text-center my-auto py-10 page-fade">
                    <div class="mb-6 animate-pulse">${getHeartSVG()}</div>
                    <h1 class="text-3xl md:text-4xl font-extrabold text-white uppercase tracking-widest mb-3">Пожалуйста, подождите…</h1>
                    <p class="text-xs md:text-sm font-bold text-amber-400 uppercase tracking-widest">Голосование начнется через несколько минут.</p>
                </div>
            `;
        }
        return;
    }

    startTimerLoop();

    if (currentSubPage === 'home') {
        card.innerHTML = `
            <div class="flex flex-col items-center text-center my-auto py-8 page-fade">
                <div class="mb-6 scale-125">${getHeartSVG()}</div>
                <h1 class="text-2xl md:text-4xl font-extrabold uppercase tracking-widest text-white mb-2">HariVision</h1>
                <div class="text-xs md:text-sm font-bold text-amber-400 uppercase tracking-widest mb-8">${isNational ? 'Национальное голосование участников' : 'Performance Contest | Август 2026'}</div>
                <div class="w-full max-w-md bg-[#16070b]/90 border border-amber-500/20 p-8 rounded-2xl">
                    <h2 class="text-lg font-bold text-white uppercase tracking-wider mb-2">Публичное голосование</h2>
                    <p class="text-xs text-slate-300 font-medium mb-8 leading-relaxed">Посмотрите повтор перед тем, как отдать свой голос.</p>
                    <button onclick="navigateTo('recap')" class="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs uppercase tracking-widest py-4 transition shadow-lg rounded-xl">Начать голосование</button>
                </div>
            </div>
        `;
    } else if (currentSubPage === 'recap') {
        card.innerHTML = `
            <div class="flex flex-col h-full justify-between gap-6 page-fade">
                <div class="flex items-center justify-between border-b border-amber-500/15 pb-4">
                    <h2 class="text-xl font-bold text-white uppercase tracking-wider">Повтор выступлений</h2>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-amber-400">Длительность: ~02:00</span>
                </div>
                <div class="relative w-full aspect-video bg-[#0a0305] border border-amber-500/20 flex flex-col items-center justify-center p-6 text-center rounded-2xl overflow-hidden">
                    <p class="text-sm md:text-base font-bold text-slate-200 uppercase tracking-wider mb-1">Здесь появится видео повтора</p>
                </div>
                <div class="flex flex-col md:flex-row gap-4 pt-2">
                    <button disabled class="flex-1 bg-[#16070b] border border-amber-500/20 text-amber-500/40 font-bold text-xs uppercase tracking-widest py-4 cursor-not-allowed rounded-xl">Смотреть повтор</button>
                    <button onclick="navigateTo('voting')" class="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs uppercase tracking-widest py-4 transition shadow-lg rounded-xl">Перейти к голосованию</button>
                </div>
            </div>
        `;
    } else if (currentSubPage === 'voting') {
        if (isNational && !selectedRepresentative) {
            card.innerHTML = `
                <div class="flex flex-col gap-6 page-fade">
                    <div class="border-b border-amber-500/15 pb-4">
                        <h2 class="text-xl font-bold text-white uppercase tracking-wider">Выберите представителя вашей страны</h2>
                        <p class="text-xs text-amber-200/70 mt-1">Голосовать за "своих" участников нельзя.</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${Object.keys(COUNTRY_RESTRICTIONS).map(rep => `
                            <button onclick="selectRepresentative('${rep}')" class="bg-[#16070b] hover:bg-amber-500/10 border border-amber-500/20 p-5 text-left transition rounded-2xl">
                                <div class="text-sm font-bold text-white uppercase">${rep}</div>
                                <div class="text-[10px] text-amber-400 mt-1">Исключаются соответствующие номера</div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
            return;
        }

        const activeRestrictions = isNational ? COUNTRY_RESTRICTIONS[selectedRepresentative] : null;
        const availablePoints = isNational ? activeRestrictions.points : [12, 10, 8, 7, 6, 5, 4, 3];
        const blockedIds = isNational ? activeRestrictions.blockedIds : [];

        const assignedParticipantIds = Object.values(userVotes);

        card.innerHTML = `
            <div class="flex flex-col gap-6 page-fade">
                <div class="flex items-center justify-between border-b border-amber-500/15 pb-4">
                    <h2 class="text-xl font-bold text-white uppercase tracking-wider">Распределение баллов</h2>
                    <div class="flex items-center gap-4">
                        <span class="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">Закроется через <span id="voting-timer">${formatTimer()}</span></span>
                        <button onclick="navigateTo('recap')" class="text-[10px] font-bold uppercase tracking-widest text-amber-400 hover:text-white transition">↺ Повтор</button>
                    </div>
                </div>

                ${isNational ? `
                    <div class="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200 rounded-xl">
                        <span>Страна: <strong>${selectedRepresentative}</strong> (Заблокированы 2 участника)</span>
                        <button onclick="selectRepresentative(null)" class="text-[10px] uppercase font-bold text-amber-400 hover:underline">Сменить</button>
                    </div>
                ` : ''}

                <div class="bg-[#16070b] border border-amber-500/20 p-4 rounded-xl">
                    <label class="block text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2">Ваше имя / Псевдоним</label>
                    <input type="text" id="voter-name-input" value="${userName}" oninput="updateUserName(this.value)" placeholder="Введите ваше имя..." class="w-full bg-[#0a0305] border border-amber-500/20 px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 rounded-lg" />
                </div>

                <div class="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-1">
                    ${availablePoints.map(pts => {
                        const currentAssignedId = userVotes[pts] || '';
                        return `
                            <div class="flex items-center justify-between bg-[#16070b] border border-amber-500/15 p-3 md:p-4 rounded-xl">
                                <div class="flex items-center gap-3 shrink-0">
                                    <span class="w-9 h-9 flex items-center justify-center font-mono font-black text-xs md:text-sm ${pts >= 10 ? 'bg-amber-400 text-slate-950' : 'bg-amber-950/60 text-amber-200 border border-amber-500/20'} rounded-lg">${pts}</span>
                                    <span class="text-xs font-bold uppercase tracking-wider text-amber-300">Баллов</span>
                                </div>
                                <select onchange="assignScore(${pts}, this.value)" class="bg-[#0a0305] border border-amber-500/20 text-white font-medium text-xs md:text-sm px-4 py-2.5 rounded-lg focus:outline-none focus:border-amber-400 w-48 md:w-64 transition">
                                    <option value="">-- Выберите участника --</option>
                                    ${DEFAULT_PARTICIPANTS.map(p => {
                                        if (blockedIds.includes(p.id)) return '';
                                        if (assignedParticipantIds.includes(p.id) && currentAssignedId !== p.id) return '';
                                        return `<option value="${p.id}" ${currentAssignedId === p.id ? 'selected' : ''}>${p.name}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="pt-2 border-t border-amber-500/15">
                    <button onclick="submitVote()" class="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs uppercase tracking-widest py-4 transition shadow-lg rounded-xl">Отправить голос</button>
                </div>
            </div>
        `;
    }
}

const isNationalPage = window.location.pathname.includes('national.html');
initApp({ isNationalMode: isNationalPage });
