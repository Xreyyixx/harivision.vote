import { db, DEFAULT_PARTICIPANTS } from './config.js';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Правила ограничений для стран
const COUNTRY_RESTRICTIONS = {
    "RODION": { blockedIds: ['p4', 'p7'], points: [12, 10, 8, 7, 6, 5] },
    "ORNELLA": { blockedIds: ['p1', 'p6'], points: [12, 10, 8, 7, 6, 5] },
    "VICTORIA": { blockedIds: ['p3', 'p8'], points: [12, 10, 8, 7, 6, 5] },
    "ANNA": { blockedIds: ['p2', 'p5'], points: [12, 10, 8, 7, 6, 5] }
};

let isNational = false;
let selectedRepresentative = null;
let systemState = { status: 'closed', endsAt: null, sessionId: null };
let currentSubPage = 'home';
let userVotes = {}; 
let userName = ''; 
let timerInterval = null;
let isRejectedByAdmin = false;

// Анимация фонового канваса
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

export function initApp(options = {}) {
    isNational = options.isNationalMode || false;

    onSnapshot(doc(db, "system", "voting_state"), (docSnap) => {
        if (docSnap.exists()) {
            const newData = docSnap.data();
            
            // Если началась новая сессия — сбрасываем локальные данные
            const savedSession = localStorage.getItem('harivision_voted_session');
            if (newData.sessionId && savedSession !== newData.sessionId) {
                localStorage.removeItem('harivision_voted_session');
                localStorage.removeItem('harivision_rejected_flag');
                userVotes = {};
                isRejectedByAdmin = false;
            }

            // Проверка: был ли голос обнулен администратором
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

// Глобальные вызовы
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
    userVotes = {}; // Сброс при смене страны
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
            <polygon points="12,6 7.5,3.5 3,7.5 12,12.5" fill="#f43f5e" opacity="0.9" />
            <polygon points="12,6 12,12.5 21,7.5 16.5,3.5" fill="#f43f5e" opacity="1.0" />
            <polygon points="3,7.5 12,21.5 12,12.5" fill="#f43f5e" opacity="0.7" />
            <polygon points="21,7.5 12,12.5 12,21.5" fill="#f43f5e" opacity="0.8" />
        </svg>
    `;
}

function render() {
    const card = document.getElementById('app-card');
    if (!card) return;

    const isExpired = systemState.endsAt && (systemState.endsAt.toMillis() <= Date.now());
    const hasVotedInCurrentSession = localStorage.getItem('harivision_voted_session') === systemState.sessionId && systemState.sessionId;

    // ПРЕДУПРЕЖДЕНИЕ: Голос был отменен админом
    if (isRejectedByAdmin) {
        card.innerHTML = `
            <div class="flex flex-col items-center text-center my-auto py-8 page-fade">
                <div class="w-16 h-16 bg-red-900/40 border border-red-500/40 flex items-center justify-center mb-4 text-red-400">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <h2 class="text-xl md:text-2xl font-black text-white uppercase tracking-widest mb-2">Ваш голос был отклонен</h2>
                <p class="text-xs text-red-300 font-medium mb-6 max-w-md">Система или администратор аннулировали ваш предыдущий голос. Вы можете проголосовать повторно.</p>
                <button onclick="dismissRejectionNotice()" class="bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs uppercase tracking-widest py-3 px-8 rounded-none transition">Понятно, проголосовать снова</button>
            </div>
        `;
        return;
    }

    // Участник проголосовал в текущей сессии
    if (hasVotedInCurrentSession) {
        const favoriteParticipantId = userVotes[12];
        const favoriteParticipant = DEFAULT_PARTICIPANTS.find(p => p.id === favoriteParticipantId);
        const thankYouVideoUrl = favoriteParticipant ? favoriteParticipant.videoUrl : null;

        card.innerHTML = `
            <div class="flex flex-col items-center text-center my-auto py-8 page-fade">
                <div class="w-16 h-16 bg-purple-900/40 border border-purple-500/40 flex items-center justify-center mb-4 text-yellow-400 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                </div>
                <h2 class="text-xl md:text-2xl font-black text-white uppercase tracking-widest mb-1">Спасибо за ваш голос!</h2>
                <p class="text-xs text-purple-300 font-medium mb-6">Ваш голос был успешно получен.</p>
                
                ${thankYouVideoUrl ? `
                    <div class="w-full max-w-md aspect-video bg-[#090414] border border-purple-500/30 mb-6 overflow-hidden shadow-2xl">
                        <video class="w-full h-full object-cover" controls autoplay src="${thankYouVideoUrl}"></video>
                    </div>
                ` : ''}

                <div class="border-t border-purple-500/10 pt-4 w-full max-w-sm">
                    <p class="text-xs text-slate-400 font-medium tracking-wide">Наслаждайтесь остальной частью HariVision Performance Contest.</p>
                </div>
            </div>
        `;
        return;
    }

    // Голосование закрыто / ожидания
    if (systemState.status === 'closed' || (systemState.status === 'open' && isExpired)) {
        if (systemState.status === 'open' && isExpired) {
            card.innerHTML = `
                <div class="flex flex-col items-center text-center my-auto py-10 page-fade">
                    <h1 class="text-2xl md:text-3xl font-extrabold text-white uppercase tracking-widest mb-4">Голосование закрыто.</h1>
                    <p class="text-sm text-purple-300 font-medium mb-2">Спасибо за поддержку HariVision Performance Contest.</p>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="flex flex-col items-center text-center my-auto py-10 page-fade">
                    <div class="mb-6 animate-pulse">${getHeartSVG()}</div>
                    <h1 class="text-3xl md:text-4xl font-extrabold text-white uppercase tracking-widest mb-3">Пожалуйста, подождите…</h1>
                    <p class="text-xs md:text-sm font-bold text-purple-400 uppercase tracking-widest">Голосование начнется через несколько минут.</p>
                </div>
            `;
        }
        return;
    }

    // Голосование открыто
    startTimerLoop();

    if (currentSubPage === 'home') {
        card.innerHTML = `
            <div class="flex flex-col items-center text-center my-auto py-8 page-fade">
                <div class="mb-6 scale-125">${getHeartSVG()}</div>
                <h1 class="text-2xl md:text-4xl font-extrabold uppercase tracking-widest text-white mb-2">HariVision</h1>
                <div class="text-xs md:text-sm font-bold text-purple-400 uppercase tracking-widest mb-8">${isNational ? 'Национальное голосование участников' : 'Performance Contest | Август 2026'}</div>
                <div class="w-full max-w-md bg-[#140b29] border border-purple-500/15 p-8 rounded-none">
                    <h2 class="text-lg font-bold text-white uppercase tracking-wider mb-2">Публичное голосование</h2>
                    <p class="text-xs text-slate-300 font-medium mb-8 leading-relaxed">Посмотрите повтор перед тем, как отдать свой голос.</p>
                    <button onclick="navigateTo('recap')" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs uppercase tracking-widest py-4 rounded-none transition shadow-lg">Начать голосование</button>
                </div>
            </div>
        `;
    } else if (currentSubPage === 'recap') {
        card.innerHTML = `
            <div class="flex flex-col h-full justify-between gap-6 page-fade">
                <div class="flex items-center justify-between border-b border-purple-500/10 pb-4">
                    <h2 class="text-xl font-bold text-white uppercase tracking-wider">Повтор выступлений</h2>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-purple-400">Длительность: ~02:00</span>
                </div>
                <div class="relative w-full aspect-video bg-[#090414] border border-purple-500/20 flex flex-col items-center justify-center p-6 text-center">
                    <p class="text-sm md:text-base font-bold text-slate-200 uppercase tracking-wider mb-1">Здесь появится видео повтора</p>
                </div>
                <div class="flex flex-col md:flex-row gap-4 pt-2">
                    <button disabled class="flex-1 bg-[#15092b] border border-purple-500/20 text-purple-500/50 font-bold text-xs uppercase tracking-widest py-4 rounded-none cursor-not-allowed">Смотреть повтор</button>
                    <button onclick="navigateTo('voting')" class="flex-1 bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs uppercase tracking-widest py-4 rounded-none transition shadow-lg">Перейти к голосованию</button>
                </div>
            </div>
        `;
    } else if (currentSubPage === 'voting') {
        // Выбор страны для национального голосования
        if (isNational && !selectedRepresentative) {
            card.innerHTML = `
                <div class="flex flex-col gap-6 page-fade">
                    <div class="border-b border-purple-500/10 pb-4">
                        <h2 class="text-xl font-bold text-white uppercase tracking-wider">Выберите представителя вашей страны</h2>
                        <p class="text-xs text-purple-300 mt-1">Голосовать за "своих" участников нельзя.</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${Object.keys(COUNTRY_RESTRICTIONS).map(rep => `
                            <button onclick="selectRepresentative('${rep}')" class="bg-[#15092b] hover:bg-purple-900/50 border border-purple-500/20 p-5 text-left transition">
                                <div class="text-sm font-bold text-white uppercase">${rep}</div>
                                <div class="text-[10px] text-purple-400 mt-1">Исключаются соответствующие номера</div>
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
                <div class="flex items-center justify-between border-b border-purple-500/10 pb-4">
                    <h2 class="text-xl font-bold text-white uppercase tracking-wider">Распределение баллов</h2>
                    <div class="flex items-center gap-4">
                        <span class="text-xs font-mono font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1">Закроется через <span id="voting-timer">${formatTimer()}</span></span>
                        <button onclick="navigateTo('recap')" class="text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-white transition">↺ Повтор</button>
                    </div>
                </div>

                ${isNational ? `
                    <div class="flex items-center justify-between bg-purple-900/20 border border-purple-500/30 p-3 text-xs text-purple-200">
                        <span>Страна: <strong>${selectedRepresentative}</strong> (Заблокированы 2 участника)</span>
                        <button onclick="selectRepresentative(null)" class="text-[10px] uppercase font-bold text-yellow-400 hover:underline">Сменить</button>
                    </div>
                ` : ''}

                <!-- Имя -->
                <div class="bg-[#140b29] border border-purple-500/20 p-4">
                    <label class="block text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">Ваше имя / Псевдоним</label>
                    <input type="text" id="voter-name-input" value="${userName}" oninput="updateUserName(this.value)" placeholder="Введите ваше имя..." class="w-full bg-[#090414] border border-purple-500/20 px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-400" />
                </div>

                <div class="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-1">
                    ${availablePoints.map(pts => {
                        const currentAssignedId = userVotes[pts] || '';
                        return `
                            <div class="flex items-center justify-between bg-[#15092b] border border-purple-500/15 p-3 md:p-4 rounded-none">
                                <div class="flex items-center gap-3 shrink-0">
                                    <span class="w-10 h-10 flex items-center justify-center font-mono font-black text-sm md:text-base ${pts >= 10 ? 'bg-yellow-500 text-slate-950' : 'bg-purple-900/80 text-purple-200 border border-purple-500/20'}">${pts}</span>
                                    <span class="text-xs font-bold uppercase tracking-wider text-purple-300">Баллов</span>
                                </div>
                                <select onchange="assignScore(${pts}, this.value)" class="bg-[#090414] border border-purple-500/20 text-white font-medium text-xs md:text-sm px-4 py-2.5 rounded-none focus:outline-none focus:border-purple-400 w-48 md:w-64 transition">
                                    <option value="">-- Выберите участника --</option>
                                    ${DEFAULT_PARTICIPANTS.map(p => {
                                        // Блокировка номеров своей страны
                                        if (blockedIds.includes(p.id)) return '';
                                        // Блокировка уже выбранных номеров
                                        if (assignedParticipantIds.includes(p.id) && currentAssignedId !== p.id) return '';
                                        return `<option value="${p.id}" ${currentAssignedId === p.id ? 'selected' : ''}>${p.name}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="pt-2 border-t border-purple-500/10">
                    <button onclick="submitVote()" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs uppercase tracking-widest py-4 rounded-none transition shadow-lg">Отправить голос</button>
                </div>
            </div>
        `;
    }
}

// Автоматическое определение режима при загрузке любой страницы
const isNationalPage = window.location.pathname.includes('national.html');
initApp({ isNationalMode: isNationalPage });
