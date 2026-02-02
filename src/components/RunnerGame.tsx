"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, RotateCcw, AlertTriangle, Lollipop, Settings, Wallet, X } from "lucide-react";

// --- Game Constants & Tuning ---
// We will determine specific constants dynamically or relative to screen, 
// but for physics consistency we can keep some scaling factors.
const PLAYER_SIZE = 60; // Hitbox size
const PLAYER_VISUAL_SIZE = 360; // Visual size (6x)
const PLAYER_SCREEN_X = 450; // Visual player position on screen
const PLAYER_X = PLAYER_SCREEN_X; // Alias for legacy references
const INITIAL_GAME_SPEED = 10;
const JUMP_FORCE = -20;
const GRAVITY = 1.2;
const MAX_ENEMY_DISTANCE = 350; // Pixels behind player (World distance)
const ENEMY_CATCH_DISTANCE = 30; // If closer than this, dead
const ENEMY_RECOVERY_RATE = 1; // How fast enemy falls back when player runs full speed
const ENEMY_CHASE_RATE = 3; // How fast enemy approaches when player is slowed
const SLOW_DURATION = 2000; // ms
const PLAYER_GROUND_OFFSET = 120; // Lowered from 280 to bring everything down to the sand
const OBSTACLE_GROUND_OFFSET = 50; // Not used but kept for ref
const MIN_WITHDRAWAL_POINTS = 1000;

type GameState = "START" | "PLAYING" | "GAME_OVER";

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
}

interface Obstacle {
    x: number;
    y: number;
    w: number;
    h: number;
    collided: boolean;
}

export default function RunnerGame() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const backgroundRef = useRef<HTMLDivElement>(null);
    const [gameState, setGameState] = useState<GameState>("START");
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [balance, setBalance] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [withdrawSuccess, setWithdrawSuccess] = useState(false);

    // Load balance from localStorage on mount
    useEffect(() => {
        const savedBalance = localStorage.getItem('gameBalance');
        if (savedBalance) {
            setBalance(parseInt(savedBalance, 10));
        }
    }, []);

    // Save balance to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('gameBalance', balance.toString());
    }, [balance]);

    // We use a ref to store mutable game state so the animation loop doesn't need to depend on React state
    const enemyImageRef = useRef<HTMLImageElement | null>(null);
    const pointsAddedRef = useRef(false); // Track if points have been added for this game session


    const playerVideoRef = useRef<HTMLVideoElement | null>(null); // Hidden video source
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null); // For chroma key processing
    const jumpSoundRef = useRef<HTMLAudioElement | null>(null);
    const canvasSizeRef = useRef({ w: 0, h: 0 }); // To track resizing

    const stateRef = useRef({
        player: {
            worldX: 0,
            y: 0, // Will be set on resize
            vy: 0,
            w: PLAYER_SIZE,
            h: PLAYER_SIZE,
            grounded: true,
            lastCollisionTime: 0,
        },
        enemy: {
            distance: MAX_ENEMY_DISTANCE, // distance behind player
        },
        // All coordinates in World Space

        obstacles: [] as Obstacle[],
        particles: [] as Particle[], // Particles in World Space
        gameSpeed: INITIAL_GAME_SPEED,
        score: 0,
        renderedScore: 0,
        frameCount: 0,
        isRunning: false,
    });

    const resetGame = useCallback(() => {
        if (!enemyImageRef.current) {
            const img = new Image();
            img.src = "/epst.png";
            enemyImageRef.current = img;
        }

        const groundY = canvasSizeRef.current.h - PLAYER_GROUND_OFFSET;

        stateRef.current = {
            player: {
                worldX: 0,
                y: groundY - PLAYER_SIZE,
                vy: 0,
                w: PLAYER_SIZE,
                h: PLAYER_SIZE,
                grounded: true,
                lastCollisionTime: 0,
            },
            enemy: {
                distance: 300,
            },

            obstacles: [],
            particles: [],
            gameSpeed: INITIAL_GAME_SPEED,
            score: 0,
            renderedScore: 0,
            frameCount: 0,
            isRunning: true,
        };
        setScore(0);
        pointsAddedRef.current = false; // Reset so points can be added on next game over
        setGameState("PLAYING");
    }, []);



    const createExplosion = (x: number, y: number, color: string) => {
        for (let i = 0; i < 10; i++) {
            stateRef.current.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color
            });
        }
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Handle Resize
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            canvasSizeRef.current = { w: canvas.width, h: canvas.height };
            // Adjust player Y if game is not running to stay on floor
            if (!stateRef.current.isRunning && gameState === "START") {
                // Reset position logic visually
                stateRef.current.player.y = canvas.height - PLAYER_GROUND_OFFSET - PLAYER_SIZE;
            }
        };
        window.addEventListener('resize', resize);
        resize(); // Initial

        // Load Enemy Image
        // Helper to load image and remove white background
        // Helper to load image and remove background (Auto-detect from top-left pixel + White)
        const loadAndProcess = (src: string, ref: React.MutableRefObject<HTMLImageElement | null>) => {
            const tempImg = new Image();
            tempImg.crossOrigin = "Anonymous";
            tempImg.onload = () => {
                const c = document.createElement('canvas');
                c.width = tempImg.width;
                c.height = tempImg.height;
                const cCtx = c.getContext('2d');
                if (cCtx) {
                    cCtx.drawImage(tempImg, 0, 0);
                    const imageData = cCtx.getImageData(0, 0, c.width, c.height);
                    const data = imageData.data;

                    // Sample top-left pixel as "Background Color"
                    const bgR = data[0];
                    const bgG = data[1];
                    const bgB = data[2];
                    const tolerance = 40;

                    const isBgColor = (r: number, g: number, b: number) => {
                        // Check for match with top-left
                        if (Math.abs(r - bgR) < tolerance && Math.abs(g - bgG) < tolerance && Math.abs(b - bgB) < tolerance) return true;
                        // Also explicitly check for white/very light (common issue)
                        if (r > 240 && g > 240 && b > 240) return true;
                        // Check for black/very dark if top-left wasn't captured well?
                        // Removing black might hurt the log texture, so we enable it only if top-left is black
                        if (bgR < 30 && bgG < 30 && bgB < 30 && r < 30 && g < 30 && b < 30) return true;

                        return false;
                    };

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        if (isBgColor(r, g, b)) {
                            data[i + 3] = 0; // Alpha 0
                        }
                    }
                    cCtx.putImageData(imageData, 0, 0);
                    // Use the processed canvas as the source image
                    const processedImg = new Image();
                    processedImg.src = c.toDataURL();
                    ref.current = processedImg;
                }
            };
            tempImg.src = src;
        };

        // Load images with background removal
        const img = new Image();
        img.src = "/epst.png";
        enemyImageRef.current = img;



        // Initialize Offscreen Canvas for Chroma Key
        if (!offscreenCanvasRef.current) {
            const oc = document.createElement('canvas');
            oc.width = PLAYER_VISUAL_SIZE;
            oc.height = PLAYER_VISUAL_SIZE;
            offscreenCanvasRef.current = oc;
        }

        // Load Jump Sound
        jumpSoundRef.current = new Audio("/screamy.mp3");

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let requestID: number;

        const loop = () => {
            if (!stateRef.current.isRunning) return;

            const state = stateRef.current;
            const now = Date.now();

            // Clear Canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // --- Logic Updates ---

            // 1. Difficulty Scaling & Movement
            if (state.frameCount % 600 === 0) {
                state.gameSpeed += 0.5;
            }

            // Move Player (World Coordinates)
            state.player.worldX += state.gameSpeed;

            // Calculate Camera Position
            // Camera follows player so player stays at PLAYER_SCREEN_X
            const cameraX = state.player.worldX - PLAYER_X; // Assuming PLAYER_X is the desired screen X for the player

            // Scroll Background (Parallax)
            if (backgroundRef.current) {
                // Determine width of cycle to keep it smooth? 
                // Just repeating endlessly.
                backgroundRef.current.style.backgroundPositionX = `-${state.player.worldX * 0.5}px`;
            }

            // 2. Player Physics
            state.player.vy += GRAVITY;
            state.player.y += state.player.vy;


            const currentGroundY = canvas.height - PLAYER_GROUND_OFFSET;
            if (state.player.y + state.player.h >= currentGroundY) {
                state.player.y = currentGroundY - state.player.h;
                state.player.vy = 0;
                state.player.grounded = true;
            } else {
                state.player.grounded = false;
            }

            if (state.enemy.distance < MAX_ENEMY_DISTANCE) {
                state.enemy.distance += ENEMY_RECOVERY_RATE * 0.5; // Drift back slowly
            }

            // 3b. Obstacle Spawning & Management
            // Spawn probability increases slightly with speed? 
            // Simple distance based spawning:
            const spawnDistance = 1200; // Spawn ahead
            const lastObstacle = state.obstacles[state.obstacles.length - 1];
            // Ensure gap
            if (!lastObstacle || (state.player.worldX + spawnDistance - lastObstacle.x > 600 + Math.random() * 500)) {
                if (Math.random() < 0.02) { // Random chance per frame if gap is met
                    const obstacleH = 45; // Trap height
                    const obstacleW = 60; // Wider for trap look
                    state.obstacles.push({
                        x: state.player.worldX + spawnDistance,
                        y: (canvas.height - PLAYER_GROUND_OFFSET) - obstacleH, // Aligned with hitbox bottom
                        w: obstacleW,
                        h: obstacleH,
                        collided: false
                    });
                }
            }

            // Move & Remove Obstacles (Actually they stay in world, just filter if too far behind?)
            // We just keep them or filter. Lets filter very old ones to save memory.
            if (state.obstacles.length > 20) {
                state.obstacles.shift();
            }

            // Collision Detection
            for (const obs of state.obstacles) {
                if (obs.collided) continue;

                // Simple AABB
                // Player is at worldX, y
                // Obs is at obs.x, obs.y
                // Width/Height standard
                // Player visual size is big, but hitbox is PLAYER_SIZE (60)

                // Allow some leniency
                const hitboxPadding = 10;

                if (
                    state.player.worldX < obs.x + obs.w - hitboxPadding &&
                    state.player.worldX + state.player.w > obs.x + hitboxPadding &&
                    state.player.y < obs.y + obs.h - hitboxPadding &&
                    state.player.y + state.player.h > obs.y + hitboxPadding
                ) {
                    // Collision! Enemy immediately catches and kills the player
                    obs.collided = true;

                    // Set enemy distance to 0 (caught) and end game
                    state.enemy.distance = 0;
                    state.isRunning = false;
                    setGameState("GAME_OVER");
                    setHighScore(prev => Math.max(prev, Math.floor(state.score)));
                    createExplosion(state.player.worldX, state.player.y + PLAYER_SIZE / 2, "red");
                }
            }

            // 4. Enemy Catch Check
            if (state.enemy.distance <= ENEMY_CATCH_DISTANCE) {
                state.isRunning = false;
                setGameState("GAME_OVER");
                setHighScore(prev => Math.max(prev, Math.floor(state.score)));
                createExplosion(state.player.worldX, state.player.y + PLAYER_SIZE / 2, "red");
            }



            // 6. Draw Player (Chroma Key)
            const isDanger = state.enemy.distance < 200;
            if (playerVideoRef.current && offscreenCanvasRef.current) {
                const pVid = playerVideoRef.current;
                const oCtx = offscreenCanvasRef.current.getContext('2d', { willReadFrequently: true });

                if (oCtx && pVid.readyState >= 2) {
                    oCtx.drawImage(pVid, 0, 0, PLAYER_VISUAL_SIZE, PLAYER_VISUAL_SIZE);
                    const frame = oCtx.getImageData(0, 0, PLAYER_VISUAL_SIZE, PLAYER_VISUAL_SIZE);
                    const l = frame.data.length;
                    // Dynamic background detection from top-left pixel
                    const bgR = frame.data[0];
                    const bgG = frame.data[1];
                    const bgB = frame.data[2];
                    const tolerance = 70; // Increased tolerance for video compression artifacts

                    for (let i = 0; i < l; i += 4) {
                        const r = frame.data[i];
                        const g = frame.data[i + 1];
                        const b = frame.data[i + 2];

                        // Check if pixel matches background color within tolerance
                        if (
                            Math.abs(r - bgR) < tolerance &&
                            Math.abs(g - bgG) < tolerance &&
                            Math.abs(b - bgB) < tolerance
                        ) {
                            frame.data[i + 3] = 0; // Set alpha to 0 (transparent)
                        }
                    }
                    oCtx.putImageData(frame, 0, 0);

                    // Draw at Screen X (Constant PLAYER_X)
                    // Hitbox at state.player.y (top) to state.player.y + PLAYER_SIZE (bottom)
                    // We want feet (bottom of visual) to be at bottom of hitbox
                    const visualOffsetTop = PLAYER_VISUAL_SIZE - PLAYER_SIZE;
                    const drawX = PLAYER_X - (PLAYER_VISUAL_SIZE - PLAYER_SIZE) / 2;
                    const drawY = state.player.y - visualOffsetTop;

                    if (isDanger) {
                        ctx.save();
                        ctx.filter = "hue-rotate(90deg) opacity(0.9)";
                        ctx.drawImage(offscreenCanvasRef.current, drawX, drawY, PLAYER_VISUAL_SIZE, PLAYER_VISUAL_SIZE);
                        ctx.restore();
                    } else {
                        ctx.drawImage(offscreenCanvasRef.current, drawX, drawY, PLAYER_VISUAL_SIZE, PLAYER_VISUAL_SIZE);
                    }
                }
            }

            if (isDanger) {
                ctx.fillStyle = "red";
                ctx.font = "bold 16px sans-serif";
                ctx.fillText("DANGER!", PLAYER_X, state.player.y - 10);
            }

            // 7. Draw Enemy
            const groundYEnemy = canvas.height - PLAYER_GROUND_OFFSET;
            // Enemy World X = Player World X - Distance
            // Enemy Screen X = (PlayerWorldX - Dist) - (PlayerWorldX - PlayerScreenX) = PlayerScreenX - Dist
            const enemyScreenX = PLAYER_X - state.enemy.distance;

            const ew = 375;
            const eh = 375;
            const ey = groundYEnemy - eh; // Aligned with feet at ground level

            if (enemyImageRef.current) {
                ctx.drawImage(enemyImageRef.current, enemyScreenX, ey, ew, eh);
            } else {
                ctx.fillStyle = "#ff0000";
                ctx.fillRect(enemyScreenX, ey + 50, 100, 100);
            }

            // 7.5 Draw Traps
            for (const obs of state.obstacles) {
                const screenX = obs.x - cameraX;
                // Only draw if on screen
                if (screenX > -100 && screenX < canvas.width + 100) {
                    if (obs.collided) {
                        ctx.fillStyle = "rgba(100, 100, 100, 0.4)"; // Faded triggered trap
                        ctx.fillRect(screenX, obs.y + obs.h - 10, obs.w, 10);
                    } else {
                        // Drawing a "Trap" (Spiky metal trap)
                        ctx.fillStyle = "#4a4a4a"; // Dark metal
                        // Base
                        ctx.fillRect(screenX, obs.y + obs.h - 10, obs.w, 10);

                        // Spikes
                        ctx.fillStyle = "#888"; // Steel color
                        const spikeCount = 3;
                        const spikeWidth = obs.w / spikeCount;
                        for (let i = 0; i < spikeCount; i++) {
                            ctx.beginPath();
                            ctx.moveTo(screenX + i * spikeWidth, obs.y + obs.h - 10);
                            ctx.lineTo(screenX + (i + 0.5) * spikeWidth, obs.y);
                            ctx.lineTo(screenX + (i + 1) * spikeWidth, obs.y + obs.h - 10);
                            ctx.fill();

                            // Shine on spikes
                            ctx.strokeStyle = "#fff";
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }

                        // Danger glow
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = "rgba(255, 0, 0, 0.5)";
                        ctx.strokeStyle = "#ff4444";
                        ctx.lineWidth = 1;
                        ctx.strokeRect(screenX, obs.y + obs.h - 10, obs.w, 10);
                        ctx.shadowBlur = 0;
                    }
                }
            }

            // 8. Particles
            for (let i = state.particles.length - 1; i >= 0; i--) {
                const p = state.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.05;

                const screenX = p.x - cameraX;

                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.fillRect(screenX, p.y, 4, 4);
                if (p.life <= 0) state.particles.splice(i, 1);
            }
            ctx.globalAlpha = 1.0;

            // Score
            state.score += 0.1;
            const currentIntScore = Math.floor(state.score);
            if (currentIntScore > state.renderedScore) {
                setScore(currentIntScore);
                state.renderedScore = currentIntScore;
            }

            state.frameCount++;
            requestID = requestAnimationFrame(loop);
        };

        if (stateRef.current.isRunning) {
            requestID = requestAnimationFrame(loop);
        } else {
            // Draw static frame if needed
        }

        return () => cancelAnimationFrame(requestID);
    }, [gameState]);

    // Input Handling
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Space" || e.code === "ArrowUp") {
                if (stateRef.current.player.grounded && stateRef.current.isRunning) {
                    stateRef.current.player.vy = JUMP_FORCE;
                    stateRef.current.player.grounded = false;

                    // Play jump sound
                    if (jumpSoundRef.current) {
                        jumpSoundRef.current.currentTime = 0;
                        jumpSoundRef.current.play().catch((e: any) => console.error("Audio play failed", e));
                    }

                } else if (!stateRef.current.isRunning && gameState !== "PLAYING") {
                    // Maybe restart on space?
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [gameState]);


    return (
        <div
            ref={backgroundRef}
            className="relative w-full h-screen bg-[url('/signup_background_clean.png')] bg-bottom flex flex-col items-center justify-center overflow-hidden font-sans"
            style={{
                backgroundSize: 'auto 100%',
                backgroundRepeat: 'repeat-x',
                // transition: 'background-position 0.1s linear' // No transition, updated by loop
            }}
        >

            <div className="absolute top-0 left-0 right-0 p-4 flex justify-center items-start z-50 pointer-events-auto">
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowSettings(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border-2 border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all text-xs font-bold uppercase tracking-wider"
                    >
                        <Settings size={14} className="text-cyan-400" /> Settings
                    </button>
                    <button
                        onClick={() => setShowWithdraw(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border-2 border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all text-xs font-bold uppercase tracking-wider"
                    >
                        <Wallet size={14} className="text-emerald-400" /> Withdraw
                    </button>
                </div>
            </div>

            {/* HUD */}
            <div className="absolute top-16 left-0 right-0 px-10 flex justify-between items-center z-10 text-white pointer-events-none">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col bg-emerald-900/80 p-3 border-2 border-emerald-400 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <span className="text-[10px] text-emerald-300 uppercase tracking-widest mb-1">Balance</span>
                        <span className="text-2xl font-bold font-mono tracking-tighter text-emerald-400">{balance.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col bg-black/80 p-3 border-2 border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <span className="text-[10px] text-neutral-400 uppercase tracking-widest mb-1">Score</span>
                        <span className="text-3xl font-bold font-mono tracking-tighter">{Math.floor(score).toString().padStart(6, '0')}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end bg-black/80 p-3 border-2 border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-widest mb-1">High Score</span>
                    <span className="text-xl font-bold font-mono text-neutral-300">{Math.floor(highScore).toString().padStart(6, '0')}</span>
                </div>
            </div>

            {/* Main Game Area */}
            <canvas
                ref={canvasRef}
                className="block bg-transparent absolute inset-0"
            />

            {/* Player Video Source (Hidden) */}
            <video
                ref={playerVideoRef}
                src="/gif caro.mp4"
                className="hidden"
                autoPlay
                loop
                muted
                playsInline
            />

            {/* Overlays */}
            <AnimatePresence>
                {gameState === "START" && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20"
                    >
                        <div className="bg-neutral-900 border-4 border-white p-8 text-center max-w-md shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                            <h1 className="text-5xl font-black text-white mb-2 tracking-tighter">RUNNER</h1>
                            <p className="text-neutral-400 mb-8 font-bold">ESCAPE FROM EPSTEIN ISLAND</p>

                            <div className="flex flex-col gap-4 text-left text-xs font-bold text-neutral-300 bg-black/50 p-4 border-2 border-neutral-700 mb-8">
                                <div className="flex items-center gap-3"><span className="px-2 py-1 bg-neutral-700 text-white">SPACE</span> Jump over traps</div>
                                <div className="flex items-center gap-3"><AlertTriangle size={16} className="text-amber-400" /> Hitting traps slows you down</div>
                                <div className="flex items-center gap-3 text-red-500 flex-wrap">IF EPSTEIN CATCHES YOU IT&apos;S OVER</div>
                            </div>

                            <button
                                onClick={resetGame}
                                className="group relative px-8 py-4 bg-white text-black font-bold text-xl border-b-8 border-r-8 border-gray-400 active:border-0 active:translate-y-2 active:translate-x-2 transition-all hover:bg-gray-100"
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    <Play size={20} fill="currentColor" /> START GAME
                                </span>
                            </button>
                        </div>
                    </motion.div>
                )}

                {gameState === "GAME_OVER" && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onAnimationStart={() => {
                            // Add score to balance when game over screen appears (only once)
                            if (!pointsAddedRef.current) {
                                const earnedPoints = Math.floor(score);
                                if (earnedPoints > 0) {
                                    setBalance(prev => prev + earnedPoints);
                                }
                                pointsAddedRef.current = true;
                            }
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-md z-30"
                    >
                        <div className="text-center bg-black/90 p-12 border-4 border-red-600 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                            <motion.div
                                initial={{ scale: 2 }}
                                animate={{ scale: 1 }}
                                className="text-7xl font-black text-red-600 mb-4 uppercase tracking-tighter"
                            >
                                WASTED
                            </motion.div>
                            <div className="text-2xl text-red-200 mb-4 font-bold">
                                FINAL SCORE: {Math.floor(score)}
                            </div>
                            <div className="text-lg text-emerald-400 mb-8 font-bold">
                                +{Math.floor(score)} added to balance
                            </div>
                            <button
                                onClick={resetGame}
                                className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold border-b-8 border-r-8 border-red-900 active:border-0 active:translate-y-2 active:translate-x-2 flex items-center gap-2 mx-auto transition-all"
                            >
                                <RotateCcw size={20} /> TRY AGAIN
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Settings & Withdraw Modals */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-[60]"
                        onClick={() => setShowSettings(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="bg-neutral-900 border-4 border-white p-8 w-full max-w-lg shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowSettings(false)}
                                className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                            <h2 className="text-2xl font-black text-white mb-8 flex items-center gap-3 border-b-4 border-neutral-800 pb-4">
                                <Settings className="text-cyan-400" /> SETTINGS
                            </h2>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-[10px] uppercase text-neutral-500 font-bold mb-2 tracking-wider">Public Key</label>
                                    <div className="bg-black/50 border-2 border-neutral-800 p-4 font-mono text-sm text-cyan-200/80 break-all shadow-inner">
                                        9V1HMz3W833ypD9MuuMgwoEPEo1Mqii6aAVevbs8pump
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase text-neutral-500 font-bold mb-2 tracking-wider">Private Key</label>
                                    <div className="bg-black/50 border-2 border-neutral-800 p-4 font-mono text-sm text-neutral-300 break-all relative group cursor-pointer shadow-inner overflow-hidden">
                                        <div className="blur-sm opacity-50 select-none transition-filter group-hover:blur-none group-hover:opacity-100 duration-300">
                                            5J7...8k3j29d9929d929d929d929d929d929d929d9...
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400 font-sans font-bold bg-black/10 group-hover:opacity-0 transition-opacity">
                                            HOVER TO REVEAL
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {showWithdraw && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-[60]"
                        onClick={() => setShowWithdraw(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="bg-neutral-900 border-4 border-white p-8 w-full max-w-md shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowWithdraw(false)}
                                className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                            <h2 className="text-2xl font-black text-white mb-8 flex items-center gap-3 border-b-4 border-neutral-800 pb-4">
                                <Wallet className="text-emerald-400" /> WITHDRAW
                            </h2>

                            <div className="bg-neutral-950 border-2 border-emerald-900/50 p-6 text-center mb-8 relative overflow-hidden">
                                <div className="absolute inset-0 bg-emerald-500/5 blur-xl"></div>
                                <div className="relative z-10">
                                    <div className="text-emerald-200/60 text-[10px] font-bold uppercase tracking-widest mb-2">Conversion Rate</div>
                                    <div className="text-2xl font-black text-emerald-400">10 POINTS = 0.002 SOL</div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center mb-8 px-5 py-4 bg-neutral-950 border-2 border-neutral-800">
                                <span className="text-neutral-400 text-[10px] font-bold uppercase tracking-wider">Available Balance</span>
                                <span className="text-2xl font-mono font-bold text-emerald-400 tracking-tight">{balance.toLocaleString()}</span>
                            </div>

                            <div className="bg-neutral-950 border-2 border-neutral-800 p-4 mb-4 flex justify-between items-center">
                                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider">Minimum Required</span>
                                <span className="text-emerald-400 font-mono font-bold">{MIN_WITHDRAWAL_POINTS.toLocaleString()}</span>
                            </div>

                            <button
                                onClick={() => {
                                    if (balance >= MIN_WITHDRAWAL_POINTS) {
                                        setWithdrawSuccess(true);
                                        setShowWithdraw(false);
                                        setBalance(0); // Clear balance after withdrawal
                                    }
                                }}
                                disabled={balance < MIN_WITHDRAWAL_POINTS}
                                className={`w-full py-4 font-bold border-b-8 border-r-8 flex items-center justify-center gap-2 transition-all ${balance >= MIN_WITHDRAWAL_POINTS
                                    ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-900 active:border-0 active:translate-y-2 active:translate-x-2"
                                    : "bg-neutral-700 text-neutral-400 border-neutral-900 cursor-not-allowed opacity-50"
                                    }`}
                            >
                                REQUEST WITHDRAWAL
                            </button>
                        </motion.div>
                    </motion.div>
                )}

                {withdrawSuccess && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-[70]"
                        onClick={() => setWithdrawSuccess(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-neutral-900 border-4 border-emerald-500 p-8 text-center max-w-sm shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-emerald-500">
                                <Wallet className="text-emerald-400" size={40} />
                            </div>
                            <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">Withdrawal Sent!</h2>
                            <p className="text-neutral-400 mb-8 font-bold text-sm">Your withdrawal request has been made successfully.</p>
                            <button
                                onClick={() => setWithdrawSuccess(false)}
                                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold border-b-4 border-emerald-900 active:border-0 active:translate-y-1 transition-all"
                            >
                                GREAT!
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Controls Hint */}
            <div className="absolute bottom-8 text-neutral-500 text-sm">
                Press <span className="text-neutral-300 font-bold">SPACE</span> to Jump
            </div>
        </div>
    );
}
