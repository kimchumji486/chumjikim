// Retro Space Pinball Engine

document.addEventListener('DOMContentLoaded', () => {
    // -----------------------------------------------------------------
    // 1. Audio System (Web Audio API Synthesizer)
    // -----------------------------------------------------------------
    class SoundSynth {
        constructor() {
            this.ctx = null;
            this.muted = false;
        }

        init() {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
        }

        playTone(freq, type, duration, volume = 0.1, sweepFreq = null) {
            if (this.muted || !this.ctx) return;
            
            try {
                // Resume if suspended
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }

                const osc = this.ctx.createOscillator();
                const gainNode = this.ctx.createGain();

                osc.type = type;
                osc.frequency.value = freq;

                if (sweepFreq !== null) {
                    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(sweepFreq, this.ctx.currentTime + duration);
                }

                gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

                osc.connect(gainNode);
                gainNode.connect(this.ctx.destination);

                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch (err) {
                console.error("Audio error:", err);
            }
        }

        playBumper() {
            this.playTone(600, 'sine', 0.15, 0.15, 150);
        }

        playSlingshot() {
            this.playTone(180, 'triangle', 0.1, 0.2, 80);
        }

        playLaunch(chargeRatio) {
            this.playTone(100, 'sine', 0.4, 0.15, 100 + chargeRatio * 400);
        }

        playFlipper() {
            this.playTone(350, 'triangle', 0.05, 0.05, 200);
        }

        playRollover() {
            this.playTone(900, 'sine', 0.2, 0.1, 1200);
        }

        playGameOver() {
            const now = this.ctx ? this.ctx.currentTime : 0;
            const notes = [400, 300, 200, 150];
            notes.forEach((freq, idx) => {
                setTimeout(() => {
                    this.playTone(freq, 'sawtooth', 0.3, 0.1, freq - 50);
                }, idx * 250);
            });
        }

        playGameStart() {
            this.init();
            const notes = [261.6, 329.6, 392.0, 523.3];
            notes.forEach((freq, idx) => {
                setTimeout(() => {
                    this.playTone(freq, 'sine', 0.2, 0.15, freq + 100);
                }, idx * 150);
            });
        }
    }

    const sound = new SoundSynth();

    // Sound toggle UI
    const soundBtn = document.getElementById('btn-toggle-sound');
    soundBtn.addEventListener('click', () => {
        sound.init();
        sound.muted = !sound.muted;
        if (sound.muted) {
            soundBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
            soundBtn.style.color = '#ef4444';
            soundBtn.style.borderColor = '#ef4444';
        } else {
            soundBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
            soundBtn.style.color = '#94a3b8';
            soundBtn.style.borderColor = 'rgba(255,255,255,0.15)';
        }
    });

    // -----------------------------------------------------------------
    // 2. Physics / Geometry Utilities
    // -----------------------------------------------------------------
    const vecDot = (v1, v2) => v1.x * v2.x + v1.y * v2.y;
    const vecDist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    
    // Line Segment collision utilities
    function getClosestPointOnSegment(p, a, b) {
        const ab = { x: b.x - a.x, y: b.y - a.y };
        const ap = { x: p.x - a.x, y: p.y - a.y };
        let t = vecDot(ap, ab) / vecDot(ab, ab);
        t = Math.max(0, Math.min(1, t)); // Clamp to segment
        return { x: a.x + t * ab.x, y: a.y + t * ab.y };
    }

    // -----------------------------------------------------------------
    // 3. Canvas & Game Objects Setup
    // -----------------------------------------------------------------
    const canvas = document.getElementById('pinball-canvas');
    const ctx = canvas.getContext('2d');
    
    const GAME_WIDTH = canvas.width;
    const GAME_HEIGHT = canvas.height;
    const GRAVITY = 0.16;
    
    // Physics Ball
    class Ball {
        constructor() {
            this.radius = 10;
            this.reset();
        }

        reset() {
            // Spawn inside launcher channel, resting on bottom wall
            this.x = 482;
            this.y = 715;
            this.vx = 0;
            this.vy = 0;
            this.active = true;
            this.inLauncher = true;
        }

        update() {
            if (!this.active) return;
            
            // Apply gravity
            this.vy += GRAVITY;
            
            // Frictional damping
            this.vx *= 0.998;
            this.vy *= 0.998;
            
            // Move
            this.x += this.vx;
            this.y += this.vy;
            
            // Speed Clamping (Prevent tunneling)
            const speed = Math.hypot(this.vx, this.vy);
            if (speed > 16) {
                this.vx = (this.vx / speed) * 16;
                this.vy = (this.vy / speed) * 16;
            }
        }

        draw() {
            if (!this.active) return;
            
            // Draw glowing core
            ctx.save();
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ffffff';
            
            // Draw ball with metallic gradient
            const grad = ctx.createRadialGradient(
                this.x - 3, this.y - 3, 2,
                this.x, this.y, this.radius
            );
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, '#cbd5e1');
            grad.addColorStop(1, '#475569');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Static Wall
    class Wall {
        constructor(x1, y1, x2, y2, color = 'rgba(129, 140, 248, 0.45)', isLauncherSeparator = false) {
            this.p1 = { x: x1, y: y1 };
            this.p2 = { x: x2, y: y2 };
            this.color = color;
            this.isLauncherSeparator = isLauncherSeparator;
        }

        draw() {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(this.p1.x, this.p1.y);
            ctx.lineTo(this.p2.x, this.p2.y);
            ctx.stroke();
        }
    }

    // Circular Bumper
    class Bumper {
        constructor(x, y, radius, points, color = '#ec4899') {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.points = points;
            this.color = color;
            this.flashTimer = 0;
        }

        trigger() {
            this.flashTimer = 8; // Flash duration in frames
            sound.playBumper();
        }

        update() {
            if (this.flashTimer > 0) this.flashTimer--;
        }

        draw() {
            ctx.save();
            const isFlashing = this.flashTimer > 0;
            
            ctx.shadowBlur = isFlashing ? 25 : 10;
            ctx.shadowColor = this.color;
            ctx.strokeStyle = isFlashing ? '#ffffff' : this.color;
            ctx.lineWidth = isFlashing ? 5 : 3;
            
            // Draw Outer Ring
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Inner graphic
            ctx.fillStyle = isFlashing ? '#ffffff' : 'rgba(236, 72, 153, 0.25)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw points label inside
            ctx.restore();
        }
    }

    // Triangle Slingshot
    class Slingshot {
        constructor(x1, y1, x2, y2, x3, y3, isLeft) {
            this.p1 = { x: x1, y: y1 };
            this.p2 = { x: x2, y: y2 };
            this.p3 = { x: x3, y: y3 };
            this.isLeft = isLeft;
            this.flashTimer = 0;
        }

        trigger() {
            this.flashTimer = 8;
            sound.playSlingshot();
        }

        update() {
            if (this.flashTimer > 0) this.flashTimer--;
        }

        draw() {
            ctx.save();
            const isFlashing = this.flashTimer > 0;
            const glowColor = '#06b6d4';
            
            ctx.shadowBlur = isFlashing ? 20 : 8;
            ctx.shadowColor = glowColor;
            ctx.fillStyle = isFlashing ? 'rgba(255, 255, 255, 0.4)' : 'rgba(6, 182, 212, 0.15)';
            ctx.strokeStyle = isFlashing ? '#ffffff' : glowColor;
            ctx.lineWidth = 3;

            ctx.beginPath();
            ctx.moveTo(this.p1.x, this.p1.y);
            ctx.lineTo(this.p2.x, this.p2.y);
            ctx.lineTo(this.p3.x, this.p3.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    // Flipper (Left and Right)
    class Flipper {
        constructor(x, y, length, isLeft) {
            this.pivot = { x, y };
            this.length = length;
            this.isLeft = isLeft;
            
            // Flipper rotation limits (radians)
            this.restAngle = isLeft ? 0.45 : Math.PI - 0.45;
            this.activeAngle = isLeft ? -0.45 : Math.PI + 0.45;
            
            this.angle = this.restAngle;
            this.active = false;
            this.radius = 8; // thickness radius
            this.angularSpeed = 0.28; // angular velocity step
        }

        flip(pressed) {
            this.active = pressed;
            if (pressed && this.angle === this.restAngle) {
                sound.playFlipper();
            }
        }

        update() {
            if (this.active) {
                // Rotate up to active position
                if (this.isLeft) {
                    this.angle = Math.max(this.activeAngle, this.angle - this.angularSpeed);
                } else {
                    this.angle = Math.min(this.activeAngle, this.angle + this.angularSpeed);
                }
            } else {
                // Fall back to rest position
                if (this.isLeft) {
                    this.angle = Math.min(this.restAngle, this.angle + this.angularSpeed * 0.7);
                } else {
                    this.angle = Math.max(this.restAngle, this.angle - this.angularSpeed * 0.7);
                }
            }
        }

        getTip() {
            return {
                x: this.pivot.x + Math.cos(this.angle) * this.length,
                y: this.pivot.y + Math.sin(this.angle) * this.length
            };
        }

        draw() {
            const tip = this.getTip();
            const glowColor = '#ec4899';

            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = glowColor;
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = 'rgba(236, 72, 153, 0.7)';
            ctx.lineWidth = this.radius * 2;
            ctx.lineCap = 'round';

            // Draw flipper blade
            ctx.beginPath();
            ctx.moveTo(this.pivot.x, this.pivot.y);
            ctx.lineTo(tip.x, tip.y);
            ctx.stroke();
            
            // Draw pivot point indicator
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.pivot.x, this.pivot.y, this.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // -----------------------------------------------------------------
    // 4. Initializing Board Elements
    // -----------------------------------------------------------------
    const ball = new Ball();
    const flippers = [
        new Flipper(165, 660, 68, true),   // Left
        new Flipper(295, 660, 68, false)   // Right
    ];

    const bumpers = [
        new Bumper(160, 220, 24, 1000, '#a855f7'), // Top Left
        new Bumper(300, 220, 24, 1000, '#06b6d4'), // Top Right
        new Bumper(230, 310, 26, 1500, '#ec4899')  // Middle
    ];

    const slingshots = [
        new Slingshot(75, 490, 115, 560, 75, 560, true), // Left
        new Slingshot(385, 490, 345, 560, 385, 560, false) // Right
    ];

    // Static table walls defining boundaries
    const walls = [];

    function initWalls() {
        // Table Boundaries
        // Main left wall
        walls.push(new Wall(0, 200, 0, 540));
        // Outer Launcher separator (ends at y=240 to leave a 120px opening for ball entry)
        walls.push(new Wall(460, 240, 460, 750, 'rgba(129, 140, 248, 0.45)', true));
        // Outer right wall
        walls.push(new Wall(500, 200, 500, 750));
        // Launcher channel bottom wall to hold the ball at start
        walls.push(new Wall(460, 725, 500, 725));
        
        // Bottom drains & side guides
        walls.push(new Wall(0, 540, 75, 610)); // Left outlane ramp
        walls.push(new Wall(460, 540, 385, 610)); // Right outlane ramp
        
        // Inlanes guides (shortened to end at slingshot bottom, not blocking the path to flippers)
        walls.push(new Wall(110, 520, 110, 560)); // Left inlane guide
        walls.push(new Wall(350, 520, 350, 560)); // Right inlane guide
        
        // Angle guides to flippers (adjusted to lead directly to flipper pivots, closing the 25px drain gaps)
        walls.push(new Wall(75, 610, 157, 655)); // Left bottom ramp
        walls.push(new Wall(385, 610, 303, 655)); // Right bottom ramp

        // Top Curve Approximation (Widened to 500px to cover the launcher channel)
        const steps = 16;
        const cx = 250; // center x of top curve
        const cy = 200; // center y
        const rx = 250; // radius x
        const ry = 200; // radius y
        let lastPt = { x: 0, y: 200 };

        for (let i = 1; i <= steps; i++) {
            const angle = Math.PI + (i / steps) * Math.PI;
            const px = cx + Math.cos(angle) * rx;
            const py = cy + Math.sin(angle) * ry * 0.75;
            walls.push(new Wall(lastPt.x, lastPt.y, px, py));
            lastPt = { x: px, y: py };
        }
    }
    
    initWalls();

    // 롤오버 레인 (Rollover Lanes)
    class RolloverLane {
        constructor(x, y, w, h, score, color = '#fbbf24') {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.score = score;
            this.color = color;
            this.active = false;
            this.cooldown = 0;
        }

        update() {
            if (this.cooldown > 0) this.cooldown--;
        }

        checkCollision(b) {
            if (this.cooldown === 0 && 
                b.x > this.x && b.x < this.x + this.w &&
                b.y > this.y && b.y < this.y + this.h) {
                
                this.active = !this.active;
                this.cooldown = 30; // 0.5s cooldown
                sound.playRollover();
                return true;
            }
            return false;
        }

        draw() {
            ctx.save();
            ctx.shadowBlur = this.active ? 15 : 2;
            ctx.shadowColor = this.color;
            ctx.fillStyle = this.active ? this.color : 'rgba(251, 191, 36, 0.1)';
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.roundRect(this.x, this.y, this.w, this.h, 6);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    const rollovers = [
        new RolloverLane(120, 80, 25, 40, 2000), // Left Lane
        new RolloverLane(215, 60, 25, 40, 2000), // Mid Lane
        new RolloverLane(310, 80, 25, 40, 2000)  // Right Lane
    ];

    // -----------------------------------------------------------------
    // 5. Game Loop & States
    // -----------------------------------------------------------------
    let score = 0;
    let highScore = parseInt(localStorage.getItem('pinball_high_score')) || 50000;
    let ballsLeft = 3;
    let multiplier = 1;
    let charge = 0;
    let charging = false;
    let gameState = 'intro'; // intro, playing, gameover

    // UI elements update
    const scoreVal = document.getElementById('score');
    const highScoreVal = document.getElementById('high-score');
    const ballCountVal = document.getElementById('ball-count');
    const multiplierVal = document.getElementById('multiplier');

    const introOverlay = document.getElementById('intro-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnRestart = document.getElementById('btn-restart');
    const finalScore = document.getElementById('final-score');

    const updateUI = () => {
        scoreVal.textContent = score.toLocaleString('ko-KR');
        highScoreVal.textContent = highScore.toLocaleString('ko-KR');
        ballCountVal.textContent = ballsLeft;
        multiplierVal.textContent = `x${multiplier}`;
    };

    updateUI();

    const addScore = (amount) => {
        score += amount * multiplier;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('pinball_high_score', highScore);
        }
        updateUI();
    };

    const startGame = () => {
        sound.playGameStart();
        score = 0;
        ballsLeft = 3;
        multiplier = 1;
        gameState = 'playing';
        ball.reset();
        
        introOverlay.classList.add('hidden');
        gameoverOverlay.classList.add('hidden');
        updateUI();
    };

    const gameOver = () => {
        gameState = 'gameover';
        sound.playGameOver();
        finalScore.textContent = score.toLocaleString('ko-KR');
        gameoverOverlay.classList.remove('hidden');
    };

    btnStartGame.addEventListener('click', startGame);
    btnRestart.addEventListener('click', startGame);

    // -----------------------------------------------------------------
    // 6. Collision Resolution
    // -----------------------------------------------------------------
    function resolveCollisions() {
        if (!ball.active) return;

        // Exit launcher mode when ball rolls to the left of the separator
        if (ball.inLauncher && ball.x < 458) {
            ball.inLauncher = false;
        }

        // 6-1. Outer walls collision
        walls.forEach(wall => {
            // Skip the launcher separator if the ball is inside launcher
            if (wall.isLauncherSeparator && ball.inLauncher) return;
            
            const closest = getClosestPointOnSegment(ball, wall.p1, wall.p2);
            const dist = vecDist(ball, closest);
            
            if (dist < ball.radius) {
                // Normal direction
                const nx = (ball.x - closest.x) / (dist || 1);
                const ny = (ball.y - closest.y) / (dist || 1);
                
                // Reposition ball outside wall
                ball.x = closest.x + nx * ball.radius;
                ball.y = closest.y + ny * ball.radius;
                
                // Reflect velocity
                const normal = { x: nx, y: ny };
                const dot = ball.vx * nx + ball.vy * ny;
                
                // Standard restitution
                const restitution = 0.55; 
                ball.vx = ball.vx - (1 + restitution) * dot * nx;
                ball.vy = ball.vy - (1 + restitution) * dot * ny;
            }
        });

        // 6-2. Circular bumpers collision
        bumpers.forEach(bumper => {
            const dist = vecDist(ball, bumper);
            if (dist < ball.radius + bumper.radius) {
                const nx = (ball.x - bumper.x) / dist;
                const ny = (ball.y - bumper.y) / dist;
                
                // Reposition ball outside bumper
                ball.x = bumper.x + nx * (ball.radius + bumper.radius);
                ball.y = bumper.y + ny * (ball.radius + bumper.radius);
                
                // Elastic reflection with acceleration
                const normal = { x: nx, y: ny };
                const dot = ball.vx * nx + ball.vy * ny;
                
                // Add energy: bounciness 1.35
                const pushBack = 1.35;
                ball.vx = (ball.vx - (1 + pushBack) * dot * nx);
                ball.vy = (ball.vy - (1 + pushBack) * dot * ny);
                
                bumper.trigger();
                addScore(bumper.points);
            }
        });

        // 6-3. Slingshots collision
        slingshots.forEach(slingshot => {
            // Collision between ball and triangle walls
            const edges = [
                { a: slingshot.p1, b: slingshot.p2 },
                { a: slingshot.p2, b: slingshot.p3 },
                { a: slingshot.p3, b: slingshot.p1 }
            ];

            edges.forEach(edge => {
                const closest = getClosestPointOnSegment(ball, edge.a, edge.b);
                const dist = vecDist(ball, closest);
                
                if (dist < ball.radius) {
                    const nx = (ball.x - closest.x) / (dist || 1);
                    const ny = (ball.y - closest.y) / (dist || 1);
                    
                    ball.x = closest.x + nx * ball.radius;
                    ball.y = closest.y + ny * ball.radius;
                    
                    const normal = { x: nx, y: ny };
                    const dot = ball.vx * nx + ball.vy * ny;
                    
                    // High kick restitution
                    const kick = 1.45;
                    ball.vx = ball.vx - (1 + kick) * dot * nx;
                    ball.vy = ball.vy - (1 + kick) * dot * ny;
                    
                    slingshot.trigger();
                    addScore(250);
                }
            });
        });

        // 6-4. Flippers collision
        flippers.forEach(flipper => {
            const pivot = flipper.pivot;
            const tip = flipper.getTip();
            
            const closest = getClosestPointOnSegment(ball, pivot, tip);
            const dist = vecDist(ball, closest);
            
            if (dist < ball.radius + flipper.radius) {
                const nx = (ball.x - closest.x) / dist;
                const ny = (ball.y - closest.y) / dist;
                
                ball.x = closest.x + nx * (ball.radius + flipper.radius);
                ball.y = closest.y + ny * (ball.radius + flipper.radius);
                
                const normal = { x: nx, y: ny };
                const dot = ball.vx * nx + ball.vy * ny;
                
                // Calculate impact speed based on flipper motion
                let impulse = 0.5; // default base restitution
                
                if (flipper.active) {
                    // Check distance from pivot to determine linear velocity
                    const distFromPivot = vecDist(closest, pivot);
                    const speedRatio = distFromPivot / flipper.length;
                    
                    // Give linear push upwards depending on position of hitting the flipper
                    impulse = 1.6 + speedRatio * 1.5;
                    
                    // Directly apply upward angular force vector
                    const forceDirectionX = flipper.isLeft ? 0.3 : -0.3;
                    ball.vx += forceDirectionX * impulse;
                    ball.vy -= 4.0 * impulse;
                }
                
                ball.vx = ball.vx - (1 + impulse) * dot * nx;
                ball.vy = ball.vy - (1 + impulse) * dot * ny;
            }
        });

        // 6-5. Rollovers lane triggers
        rollovers.forEach(lane => {
            if (lane.checkCollision(ball)) {
                addScore(lane.score);
                
                // Check if all rollover lanes are active
                const allActive = rollovers.every(l => l.active);
                if (allActive) {
                    multiplier += 1;
                    showToast(`MULTIPLIER INCREASED: x${multiplier}!`);
                    // Reset lanes
                    rollovers.forEach(l => l.active = false);
                }
            }
        });

        // 6-6. One-way gate at the top of the launcher channel
        if (!ball.inLauncher && ball.vy > 0 && ball.x > 458 && ball.y > 210 && ball.y < 240) {
            ball.x = 448;
            ball.vx = -Math.abs(ball.vx) - 2.5; // Deflect left into the playfield
            ball.vy = -Math.abs(ball.vy) * 0.3;  // Bounce up slightly
            sound.playRollover(); // Click sound
        }

        // 6-7. Bottom drain hole (Dead zone)
        if (ball.y > GAME_HEIGHT + 50) {
            ballsLeft--;
            updateUI();
            
            if (ballsLeft > 0) {
                ball.reset();
                showToast('BALL LOST - READY PLUNGER');
            } else {
                gameOver();
            }
        }
    }

    // -----------------------------------------------------------------
    // 7. Inputs Handling
    // -----------------------------------------------------------------
    const activeKeys = {};

    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        activeKeys[key] = true;

        if (gameState === 'playing') {
            // Left Flipper
            if (key === 'z' || e.key === 'ArrowLeft') {
                flippers[0].flip(true);
            }
            // Right Flipper
            if (key === '/' || e.key === 'ArrowRight') {
                flippers[1].flip(true);
            }
            // Launcher Charging
            if (e.key === ' ' && ball.inLauncher) {
                e.preventDefault();
                charging = true;
            }
        } else if (gameState === 'intro' && e.key === ' ') {
            e.preventDefault();
            startGame();
        }
    });

    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        activeKeys[key] = false;

        if (gameState === 'playing') {
            if (key === 'z' || e.key === 'ArrowLeft') {
                flippers[0].flip(false);
            }
            if (key === '/' || e.key === 'ArrowRight') {
                flippers[1].flip(false);
            }
            
            // Release Launcher
            if (e.key === ' ' && charging) {
                charging = false;
                // Launch ball with upward vy proportional to charge duration
                const launchForce = -6 - (charge * 1.5);
                ball.vy = launchForce;
                ball.vx = 0; // standard vertical launch
                sound.playLaunch(charge);
                charge = 0;
            }
        }
    });

    // Mobile/Mouse tap controls for flippers (Left side screen click/Right side screen click)
    canvas.addEventListener('touchstart', (e) => {
        if (gameState !== 'playing') return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        
        if (touchX < rect.width / 2) {
            flippers[0].flip(true);
        } else {
            flippers[1].flip(true);
        }
    });

    canvas.addEventListener('touchend', (e) => {
        if (gameState !== 'playing') return;
        flippers[0].flip(false);
        flippers[1].flip(false);
    });

    // Toast feedback function
    const showToast = (msg) => {
        const toast = document.createElement('div');
        toast.className = 'game-toast';
        toast.style.position = 'absolute';
        toast.style.top = '15%';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.fontFamily = 'Press Start 2P';
        toast.style.fontSize = '0.7rem';
        toast.style.color = '#fbbf24';
        toast.style.background = 'rgba(0,0,0,0.85)';
        toast.style.border = '1px solid #fbbf24';
        toast.style.padding = '8px 16px';
        toast.style.borderRadius = '8px';
        toast.style.zIndex = '100';
        toast.style.pointerEvents = 'none';
        toast.textContent = msg;

        document.querySelector('.canvas-wrapper').appendChild(toast);
        setTimeout(() => toast.remove(), 1800);
    };

    // -----------------------------------------------------------------
    // 8. Renderer
    // -----------------------------------------------------------------
    function drawLauncherGauge() {
        if (!ball.inLauncher) return;
        
        // Draw plunger gauge background
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(475, 620, 14, 100);
        
        // Draw charge fill
        const fillHeight = charge * 10;
        const grad = ctx.createLinearGradient(475, 720, 475, 620);
        grad.addColorStop(0, '#ef4444');
        grad.addColorStop(0.5, '#fbbf24');
        grad.addColorStop(1, '#10b981');
        
        ctx.fillStyle = grad;
        ctx.fillRect(475, 720 - fillHeight, 14, fillHeight);
        
        // Draw border
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(475, 620, 14, 100);
    }

    function drawLanesDecoration() {
        // Draw guides to rollover lanes
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Lane guides
        ctx.moveTo(110, 50); ctx.lineTo(110, 120);
        ctx.moveTo(150, 50); ctx.lineTo(150, 120);
        ctx.moveTo(205, 50); ctx.lineTo(205, 100);
        ctx.moveTo(245, 50); ctx.lineTo(245, 100);
        ctx.moveTo(300, 50); ctx.lineTo(300, 120);
        ctx.moveTo(340, 50); ctx.lineTo(340, 120);
        ctx.stroke();

        // Neon outer lanes styling
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#6366f1';
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(75, 500); ctx.lineTo(110, 540);
        ctx.moveTo(385, 500); ctx.lineTo(350, 540);
        ctx.stroke();
        ctx.restore();
    }

    function render() {
        // Clear board
        ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Grid lines effect
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.04)';
        ctx.lineWidth = 1;
        const gridGap = 35;
        for (let x = 0; x < GAME_WIDTH; x += gridGap) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_HEIGHT); ctx.stroke();
        }
        for (let y = 0; y < GAME_HEIGHT; y += gridGap) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_WIDTH, y); ctx.stroke();
        }

        // Draw Lanes Decoration
        drawLanesDecoration();

        // Draw Rollovers
        rollovers.forEach(lane => lane.draw());

        // Draw Bumpers
        bumpers.forEach(bumper => bumper.draw());

        // Draw Slingshots
        slingshots.forEach(slingshot => slingshot.draw());

        // Draw Flippers
        flippers.forEach(flipper => flipper.draw());

        // Draw Static Walls
        walls.forEach(wall => wall.draw());

        // Draw Launcher Plunger Charge Gauge
        drawLauncherGauge();

        // Draw Ball
        ball.draw();
    }

    // -----------------------------------------------------------------
    // 9. Main Game Loop
    // -----------------------------------------------------------------
    function tick() {
        if (gameState === 'playing') {
            // Charge plunger
            if (charging) {
                charge = Math.min(10, charge + 0.15);
            }
            
            // Update objects
            ball.update();
            flippers.forEach(f => f.update());
            bumpers.forEach(b => b.update());
            slingshots.forEach(s => s.update());
            rollovers.forEach(l => l.update());
            
            // Handle Physics collisions
            resolveCollisions();
        }
        
        // Draw Frame
        render();
        
        requestAnimationFrame(tick);
    }

    // Kickoff Game Loop
    requestAnimationFrame(tick);
});
