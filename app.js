// 알까기 (Al-kkagi) Game Engine

document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // 1. AUDIO
    // =================================================================
    class SFX {
        constructor() {
            this.ctx = null;
        }
        init() {
            if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        tone(freq, type, dur, vol = 0.1, sweep = null) {
            if (!this.ctx) return;
            try {
                if (this.ctx.state === 'suspended') this.ctx.resume();
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.type = type; o.frequency.value = freq;
                if (sweep) o.frequency.exponentialRampToValueAtTime(sweep, this.ctx.currentTime + dur);
                g.gain.setValueAtTime(vol, this.ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
                o.connect(g); g.connect(this.ctx.destination);
                o.start(); o.stop(this.ctx.currentTime + dur);
            } catch (e) {}
        }
        hit()    { this.tone(200, 'triangle', 0.12, 0.15, 80); }
        flick()  { this.tone(300, 'sine', 0.15, 0.1, 500); }
        out()    { this.tone(120, 'sawtooth', 0.35, 0.12, 60); }
        win()    { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 'sine', 0.25, 0.12), i * 150)); }
        lose()   { [400, 300, 200, 150].forEach((f, i) => setTimeout(() => this.tone(f, 'sawtooth', 0.3, 0.1), i * 200)); }
    }
    const sfx = new SFX();

    // =================================================================
    // 2. CANVAS & CONSTANTS
    // =================================================================
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const STONE_R = 22;
    const FRICTION = 0.975;
    const STOP_THRESHOLD = 0.15;
    const BOARD_PAD = 8; // padding inside border for OOB detection
    const MAX_POWER = 18;

    // =================================================================
    // 3. GAME STATE
    // =================================================================
    let gameState = 'intro'; // intro | playerTurn | aiTurn | animating | result
    let difficulty = 'easy';
    let stones = [];
    let selectedStone = null;
    let dragStart = null;
    let dragCurrent = null;

    // UI References
    const introOverlay = document.getElementById('intro-overlay');
    const resultOverlay = document.getElementById('result-overlay');
    const resultTitle = document.getElementById('result-title');
    const resultDesc = document.getElementById('result-desc');
    const resultIcon = document.getElementById('result-icon');
    const btnStart = document.getElementById('btn-start');
    const btnRestart = document.getElementById('btn-restart');
    const turnBadge = document.getElementById('turn-badge');
    const turnText = document.getElementById('turn-text');
    const playerStonesUI = document.getElementById('player-stones');
    const aiStonesUI = document.getElementById('ai-stones');
    const powerBarWrapper = document.getElementById('power-bar-wrapper');
    const powerFill = document.getElementById('power-fill');

    // Difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            difficulty = btn.getAttribute('data-diff');
        });
    });

    // =================================================================
    // 4. STONE CLASS
    // =================================================================
    class Stone {
        constructor(x, y, team) {
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.r = STONE_R;
            this.team = team; // 'player' or 'ai'
            this.alive = true;
        }

        isMoving() {
            return Math.abs(this.vx) > STOP_THRESHOLD || Math.abs(this.vy) > STOP_THRESHOLD;
        }

        update() {
            if (!this.alive) return;

            this.x += this.vx;
            this.y += this.vy;

            this.vx *= FRICTION;
            this.vy *= FRICTION;

            // Stop if very slow
            if (Math.abs(this.vx) < STOP_THRESHOLD) this.vx = 0;
            if (Math.abs(this.vy) < STOP_THRESHOLD) this.vy = 0;

            // Out of bounds check
            if (this.x < -this.r - BOARD_PAD || this.x > W + this.r + BOARD_PAD ||
                this.y < -this.r - BOARD_PAD || this.y > H + this.r + BOARD_PAD) {
                this.alive = false;
                sfx.out();
            }
        }

        draw() {
            if (!this.alive) return;

            ctx.save();

            // Shadow
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;

            // Main body gradient
            const isBlue = this.team === 'player';
            const baseColor = isBlue ? '#3b82f6' : '#ef4444';
            const lightColor = isBlue ? '#93c5fd' : '#fca5a5';
            const darkColor = isBlue ? '#1e40af' : '#991b1b';

            const grad = ctx.createRadialGradient(
                this.x - this.r * 0.3, this.y - this.r * 0.3, this.r * 0.1,
                this.x, this.y, this.r
            );
            grad.addColorStop(0, lightColor);
            grad.addColorStop(0.5, baseColor);
            grad.addColorStop(1, darkColor);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fill();

            // Highlight (specular)
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            const specGrad = ctx.createRadialGradient(
                this.x - this.r * 0.25, this.y - this.r * 0.25, 1,
                this.x - this.r * 0.25, this.y - this.r * 0.25, this.r * 0.5
            );
            specGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
            specGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = specGrad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    // =================================================================
    // 5. BOARD INITIALIZATION
    // =================================================================
    function initStones() {
        stones = [];
        // Player stones (bottom, blue)
        const pY = H - 70;
        const spacing = 70;
        const startX = (W - spacing * 4) / 2;
        for (let i = 0; i < 5; i++) {
            stones.push(new Stone(startX + i * spacing, pY, 'player'));
        }
        // AI stones (top, red)
        const aY = 70;
        for (let i = 0; i < 5; i++) {
            stones.push(new Stone(startX + i * spacing, aY, 'ai'));
        }
    }

    // =================================================================
    // 6. PHYSICS
    // =================================================================
    function resolveCollisions() {
        const alive = stones.filter(s => s.alive);
        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                const a = alive[i];
                const b = alive[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                const minDist = a.r + b.r;

                if (dist < minDist && dist > 0) {
                    sfx.hit();

                    // Normal
                    const nx = dx / dist;
                    const ny = dy / dist;

                    // Relative velocity along normal
                    const dvx = a.vx - b.vx;
                    const dvy = a.vy - b.vy;
                    const dvn = dvx * nx + dvy * ny;

                    // Don't resolve if moving apart
                    if (dvn < 0) continue;

                    // Elastic collision (equal mass)
                    const restitution = 0.9;
                    const impulse = dvn * (1 + restitution) / 2;

                    a.vx -= impulse * nx;
                    a.vy -= impulse * ny;
                    b.vx += impulse * nx;
                    b.vy += impulse * ny;

                    // Separate overlap
                    const overlap = minDist - dist;
                    a.x -= (overlap / 2) * nx;
                    a.y -= (overlap / 2) * ny;
                    b.x += (overlap / 2) * nx;
                    b.y += (overlap / 2) * ny;
                }
            }
        }
    }

    function anyMoving() {
        return stones.some(s => s.alive && s.isMoving());
    }

    // =================================================================
    // 7. AI LOGIC
    // =================================================================
    function aiTurn() {
        const aiStones = stones.filter(s => s.alive && s.team === 'ai');
        const playerStones = stones.filter(s => s.alive && s.team === 'player');

        if (aiStones.length === 0 || playerStones.length === 0) return;

        let bestShooter = null;
        let bestTarget = null;
        let bestScore = -Infinity;

        aiStones.forEach(shooter => {
            playerStones.forEach(target => {
                const dx = target.x - shooter.x;
                const dy = target.y - shooter.y;
                const dist = Math.hypot(dx, dy);

                // Score: prefer close targets, targets near edge
                let score = 1000 - dist;

                // Bonus for targets near edges (easier to push out)
                const edgeDist = Math.min(target.x, target.y, W - target.x, H - target.y);
                score += (150 - edgeDist) * 2;

                if (score > bestScore) {
                    bestScore = score;
                    bestShooter = shooter;
                    bestTarget = target;
                }
            });
        });

        if (!bestShooter || !bestTarget) return;

        const dx = bestTarget.x - bestShooter.x;
        const dy = bestTarget.y - bestShooter.y;
        const dist = Math.hypot(dx, dy);
        const nx = dx / dist;
        const ny = dy / dist;

        // Power calculation based on difficulty and distance
        let power;
        let accuracy;
        switch (difficulty) {
            case 'easy':
                power = Math.min(6 + dist * 0.02, 10);
                accuracy = 0.25; // high inaccuracy
                break;
            case 'normal':
                power = Math.min(8 + dist * 0.025, 13);
                accuracy = 0.12;
                break;
            case 'hard':
                power = Math.min(10 + dist * 0.03, MAX_POWER);
                accuracy = 0.04; // very accurate
                break;
            default:
                power = 8;
                accuracy = 0.15;
        }

        // Add some randomness to aim
        const angleOffset = (Math.random() - 0.5) * accuracy * Math.PI;
        const cos = Math.cos(angleOffset);
        const sin = Math.sin(angleOffset);
        const aimX = nx * cos - ny * sin;
        const aimY = nx * sin + ny * cos;

        bestShooter.vx = aimX * power;
        bestShooter.vy = aimY * power;

        sfx.flick();
    }

    // =================================================================
    // 8. UI UPDATES
    // =================================================================
    function updateUI() {
        const pCount = stones.filter(s => s.alive && s.team === 'player').length;
        const aCount = stones.filter(s => s.alive && s.team === 'ai').length;

        playerStonesUI.textContent = '●'.repeat(pCount) + '○'.repeat(5 - pCount);
        aiStonesUI.textContent = '●'.repeat(aCount) + '○'.repeat(5 - aCount);

        if (gameState === 'playerTurn') {
            turnText.textContent = '내 차례';
            turnBadge.classList.remove('ai-turn');
        } else if (gameState === 'aiTurn') {
            turnText.textContent = '컴퓨터 차례';
            turnBadge.classList.add('ai-turn');
        } else if (gameState === 'animating') {
            turnText.textContent = '이동 중...';
        }
    }

    function checkWin() {
        const pCount = stones.filter(s => s.alive && s.team === 'player').length;
        const aCount = stones.filter(s => s.alive && s.team === 'ai').length;

        if (aCount === 0) {
            gameState = 'result';
            resultIcon.textContent = '🏆';
            resultTitle.textContent = '승리!';
            resultDesc.textContent = `모든 상대 알을 밀어냈습니다! (남은 내 알: ${pCount}개)`;
            resultOverlay.classList.remove('hidden');
            sfx.win();
            return true;
        }
        if (pCount === 0) {
            gameState = 'result';
            resultIcon.textContent = '😵';
            resultTitle.textContent = '패배...';
            resultDesc.textContent = '내 알이 모두 제거되었습니다. 다시 도전하세요!';
            resultOverlay.classList.remove('hidden');
            sfx.lose();
            return true;
        }
        return false;
    }

    // =================================================================
    // 9. INPUT HANDLING
    // =================================================================
    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = W / rect.width;
        const scaleY = H / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function onPointerDown(e) {
        if (gameState !== 'playerTurn') return;
        e.preventDefault();
        const pos = getCanvasPos(e);

        // Find player stone under cursor
        const playerStones = stones.filter(s => s.alive && s.team === 'player');
        for (const s of playerStones) {
            const dist = Math.hypot(pos.x - s.x, pos.y - s.y);
            if (dist < s.r + 5) {
                selectedStone = s;
                dragStart = { x: pos.x, y: pos.y };
                dragCurrent = { x: pos.x, y: pos.y };
                powerBarWrapper.classList.remove('hidden');
                canvas.style.cursor = 'grabbing';
                return;
            }
        }
    }

    function onPointerMove(e) {
        if (!selectedStone || gameState !== 'playerTurn') return;
        e.preventDefault();
        dragCurrent = getCanvasPos(e);

        // Update power bar
        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;
        const power = Math.min(Math.hypot(dx, dy) / 12, MAX_POWER);
        const pct = (power / MAX_POWER) * 100;
        powerFill.style.width = `${pct}%`;
    }

    function onPointerUp(e) {
        if (!selectedStone || gameState !== 'playerTurn') return;
        e.preventDefault();

        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;
        const rawPower = Math.hypot(dx, dy) / 12;

        if (rawPower < 0.5) {
            // Too weak, cancel
            selectedStone = null;
            dragStart = null;
            dragCurrent = null;
            powerBarWrapper.classList.add('hidden');
            canvas.style.cursor = 'default';
            return;
        }

        const power = Math.min(rawPower, MAX_POWER);
        const dist = Math.hypot(dx, dy);
        selectedStone.vx = (dx / dist) * power;
        selectedStone.vy = (dy / dist) * power;

        sfx.flick();

        selectedStone = null;
        dragStart = null;
        dragCurrent = null;
        powerBarWrapper.classList.add('hidden');
        canvas.style.cursor = 'default';
        gameState = 'animating';
        updateUI();
    }

    // Mouse
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    // Touch
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp, { passive: false });

    // Hover cursor for player stones
    canvas.addEventListener('mousemove', (e) => {
        if (gameState !== 'playerTurn' || selectedStone) return;
        const pos = getCanvasPos(e);
        const playerStones = stones.filter(s => s.alive && s.team === 'player');
        const hovered = playerStones.some(s => Math.hypot(pos.x - s.x, pos.y - s.y) < s.r + 5);
        canvas.style.cursor = hovered ? 'grab' : 'default';
    });

    // =================================================================
    // 10. RENDERING
    // =================================================================
    function drawBoard() {
        // Background wood color
        ctx.fillStyle = '#c4973a';
        ctx.fillRect(0, 0, W, H);

        // Subtle wood grain lines
        ctx.strokeStyle = 'rgba(139, 105, 20, 0.15)';
        ctx.lineWidth = 1;
        for (let y = 0; y < H; y += 12) {
            ctx.beginPath();
            ctx.moveTo(0, y + Math.sin(y * 0.1) * 3);
            for (let x = 0; x < W; x += 10) {
                ctx.lineTo(x, y + Math.sin((y + x) * 0.08) * 3);
            }
            ctx.stroke();
        }

        // Center decoration
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fill();

        // Quadrant lines
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Corner markers
        const cornerSize = 20;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 2;
        [[0, 0], [W, 0], [0, H], [W, H]].forEach(([cx, cy]) => {
            ctx.beginPath();
            ctx.arc(cx, cy, cornerSize, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    function drawAimLine() {
        if (!selectedStone || !dragStart || !dragCurrent) return;

        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;
        const power = Math.min(Math.hypot(dx, dy) / 12, MAX_POWER);

        if (power < 0.5) return;

        const dist = Math.hypot(dx, dy);
        const nx = dx / dist;
        const ny = dy / dist;

        // Draw arrow line from stone in flick direction
        const lineLen = power * 8;
        const endX = selectedStone.x + nx * lineLen;
        const endY = selectedStone.y + ny * lineLen;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(selectedStone.x, selectedStone.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow tip
        const arrowSize = 10;
        const angle = Math.atan2(ny, nx);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - arrowSize * Math.cos(angle - 0.4), endY - arrowSize * Math.sin(angle - 0.4));
        ctx.lineTo(endX - arrowSize * Math.cos(angle + 0.4), endY - arrowSize * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Selection ring on the selected stone
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(selectedStone.x, selectedStone.y, selectedStone.r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function render() {
        drawBoard();

        // Draw stones
        stones.forEach(s => s.draw());

        // Draw aim line
        drawAimLine();
    }

    // =================================================================
    // 11. GAME LOOP
    // =================================================================
    let waitingForAI = false;
    let aiDelayTimer = 0;

    function tick() {
        // Physics update
        if (gameState === 'animating' || gameState === 'aiTurn') {
            stones.forEach(s => s.update());
            resolveCollisions();

            if (!anyMoving()) {
                updateUI();

                if (checkWin()) {
                    // Game over
                } else if (gameState === 'animating') {
                    // Switch to AI turn after player's shot finishes
                    if (stones.some(s => s.alive && s.team === 'ai')) {
                        gameState = 'aiTurn';
                        waitingForAI = true;
                        aiDelayTimer = 50; // ~0.83s delay
                        updateUI();
                    }
                } else if (gameState === 'aiTurn') {
                    // AI turn finished, go to player turn
                    gameState = 'playerTurn';
                    updateUI();
                }
            }
        }

        // AI delay & execution
        if (waitingForAI && gameState === 'aiTurn') {
            aiDelayTimer--;
            if (aiDelayTimer <= 0) {
                waitingForAI = false;
                aiTurn();
            }
        }

        render();
        requestAnimationFrame(tick);
    }

    // =================================================================
    // 12. GAME START / RESTART
    // =================================================================
    function startGame() {
        sfx.init();
        initStones();
        gameState = 'playerTurn';
        introOverlay.classList.add('hidden');
        resultOverlay.classList.add('hidden');
        updateUI();
    }

    btnStart.addEventListener('click', startGame);
    btnRestart.addEventListener('click', startGame);

    // Kick off render loop
    requestAnimationFrame(tick);
});
