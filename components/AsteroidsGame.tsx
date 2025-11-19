
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Asteroid, Bullet, GameState, Particle, Ship, HighScore, Ufo, PowerUp, PowerUpType, Missile, Point } from '../types';
import { checkCollision, generateAsteroidVertices, randomRange, rotatePoint, wrapPosition, DEG_TO_RAD, distance, normalizeAngle } from '../utils/gameMath';
import { generateGameCommentary } from '../services/geminiService';

// Game Constants
const SHIP_SIZE = 20;
const TURN_SPEED = 240 * DEG_TO_RAD;
const THRUST_POWER = 300;
const BULLET_SPEED = 400;
const UFO_BULLET_SPEED = 200; 
const BULLET_LIFE = 1.5;
const FIRE_RATE = 0.2;
const HIGH_SCORES_KEY = 'asteroids_high_scores';

// Power Up Constants
const POWERUP_DURATION = 10.0; // seconds
const POWERUP_DROP_RATE = 0.1; // 10% chance
const MISSILE_SPEED = 350;
const MISSILE_TURN_SPEED = 3.0;

// UFO Constants
const UFO_SPEED = 100;
const UFO_SIZE = 20;
const UFO_SPAWN_RATE_MIN = 15000; // ms
const UFO_SPAWN_RATE_MAX = 30000; // ms
const UFO_FIRE_RATE = 1.5;

const ASTEROID_CONFIG = {
  large: { radius: 40, score: 20, speed: 50, count: 2 },
  medium: { radius: 25, score: 50, speed: 80, count: 3 },
  small: { radius: 15, score: 100, speed: 120, count: 0 },
};

export const AsteroidsGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);

  // Game State
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [aiMessage, setAiMessage] = useState<string>("Initializing...");
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // High Score State
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [initials, setInitials] = useState('');
  const [newHighScoreIndex, setNewHighScoreIndex] = useState<number | null>(null);

  // Mutable Game Refs
  const shipRef = useRef<Ship | null>(null);
  const ufoRef = useRef<Ufo | null>(null);
  const asteroidsRef = useRef<Asteroid[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const missilesRef = useRef<Missile[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  
  // Timers
  const lastUfoSpawnTimeRef = useRef<number>(0);
  const nextUfoSpawnDelayRef = useRef<number>(20000);

  // --- Helpers ---

  const loadHighScores = () => {
    const stored = localStorage.getItem(HIGH_SCORES_KEY);
    if (stored) {
      setHighScores(JSON.parse(stored));
    } else {
      const defaults: HighScore[] = [
        { name: 'AAA', score: 10000, date: Date.now() },
        { name: 'BOB', score: 8000, date: Date.now() },
        { name: 'HAL', score: 5000, date: Date.now() },
        { name: 'CPU', score: 3000, date: Date.now() },
        { name: 'NEO', score: 1000, date: Date.now() },
      ];
      setHighScores(defaults);
      localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(defaults));
    }
  };

  useEffect(() => {
    loadHighScores();
  }, []);

  const createExplosion = (pos: { x: number; y: number }, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const speed = randomRange(50, 150);
      const angle = randomRange(0, Math.PI * 2);
      particlesRef.current.push({
        id: Math.random().toString(),
        position: { ...pos },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        angle: 0,
        radius: 1,
        color: color,
        dead: false,
        life: randomRange(0.5, 1.0),
        maxLife: 1.0,
        size: randomRange(1, 3),
      });
    }
  };

  const spawnPowerUp = (position: {x: number, y: number}) => {
      if (Math.random() > POWERUP_DROP_RATE) return;

      const types: PowerUpType[] = ['MULTI_SHOT', 'SHIELD', 'TIME_SLOW', 'MISSILE'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      powerUpsRef.current.push({
          id: Math.random().toString(),
          position: { ...position },
          velocity: { x: randomRange(-20, 20), y: randomRange(-20, 20) },
          angle: 0,
          radius: 15,
          color: type === 'MULTI_SHOT' ? '#facc15' : type === 'SHIELD' ? '#3b82f6' : type === 'TIME_SLOW' ? '#a855f7' : '#ef4444',
          dead: false,
          type: type,
          life: 15.0 // Disappear after 15s if not picked up
      });
  };

  const spawnAsteroids = (count: number, levelMultiplier: number, width: number, height: number) => {
    const newAsteroids: Asteroid[] = [];
    for (let i = 0; i < count + levelMultiplier; i++) {
      let x, y;
      do {
        x = randomRange(0, width);
        y = randomRange(0, height);
      } while (Math.abs(x - width / 2) < 150 && Math.abs(y - height / 2) < 150);

      const speed = ASTEROID_CONFIG.large.speed * randomRange(0.8, 1.2);
      const angle = randomRange(0, Math.PI * 2);

      newAsteroids.push({
        id: Math.random().toString(),
        position: { x, y },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        angle: 0,
        rotationSpeed: randomRange(-2, 2),
        radius: ASTEROID_CONFIG.large.radius,
        color: '#f472b6', // pink-400
        dead: false,
        size: 'large',
        vertices: generateAsteroidVertices(ASTEROID_CONFIG.large.radius, 10),
      });
    }
    asteroidsRef.current = [...asteroidsRef.current, ...newAsteroids];
  };

  const spawnUfo = (width: number, height: number) => {
    const startLeft = Math.random() > 0.5;
    const y = randomRange(height * 0.2, height * 0.8);
    
    ufoRef.current = {
      id: 'ufo',
      position: { x: startLeft ? 0 : width, y },
      velocity: { x: startLeft ? UFO_SPEED : -UFO_SPEED, y: 0 },
      angle: 0,
      radius: UFO_SIZE,
      color: '#a855f7', // purple-500
      dead: false,
      directionChangeTimer: 0,
      shootCooldown: 2.0,
      accuracy: 0.8
    };
  };

  const resetShip = (width: number, height: number) => {
    shipRef.current = {
      id: 'hero',
      position: { x: width / 2, y: height / 2 },
      velocity: { x: 0, y: 0 },
      angle: -Math.PI / 2,
      radius: SHIP_SIZE,
      color: '#22d3ee', // cyan-400
      dead: false,
      rotationSpeed: 0,
      thrusting: false,
      invulnerable: 3.0,
      cooldown: 0,
      powerupMultiShotTimer: 0,
      powerupShieldTimer: 0,
      powerupTimeSlowTimer: 0,
      missileAmmo: 0, // Start with 0 missiles
    };
  };

  const fetchAiCommentary = useCallback(async (type: 'start' | 'game_over' | 'level_clear', currentScore?: number) => {
    setIsAiLoading(true);
    const msg = await generateGameCommentary(type, currentScore);
    setAiMessage(msg);
    setIsAiLoading(false);
  }, []);

  const startGame = () => {
    setScore(0);
    setLives(3);
    setLevel(1);
    setGameState(GameState.LEVEL_TRANSITION);
    setNewHighScoreIndex(null);
    setInitials('');
    
    asteroidsRef.current = [];
    bulletsRef.current = [];
    particlesRef.current = [];
    powerUpsRef.current = [];
    missilesRef.current = [];
    ufoRef.current = null;
    lastUfoSpawnTimeRef.current = Date.now();

    if (canvasRef.current) {
        resetShip(canvasRef.current.width, canvasRef.current.height);
        setTimeout(() => {
            if (canvasRef.current) {
                spawnAsteroids(3, 0, canvasRef.current.width, canvasRef.current.height);
                setGameState(GameState.PLAYING);
                fetchAiCommentary('start');
            }
        }, 2000);
    }
  };

  const startNextLevel = () => {
      const nextLevel = level + 1;
      setLevel(nextLevel);
      setGameState(GameState.LEVEL_TRANSITION);
      fetchAiCommentary('level_clear');
      
      setTimeout(() => {
        if (canvasRef.current) {
            // Reset Ship Position & Invulnerability for next level
            if (shipRef.current) {
                shipRef.current.position = { x: canvasRef.current.width / 2, y: canvasRef.current.height / 2 };
                shipRef.current.velocity = { x: 0, y: 0 };
                shipRef.current.angle = -Math.PI / 2;
                shipRef.current.invulnerable = 3.0; // Invincible for 3s
                shipRef.current.thrusting = false;
            }

            spawnAsteroids(3, nextLevel, canvasRef.current!.width, canvasRef.current!.height);
            setGameState(GameState.PLAYING);
            lastUfoSpawnTimeRef.current = Date.now(); 
        }
      }, 2000);
  };

  const handleGameOver = () => {
    setGameState(GameState.GAME_OVER);
    fetchAiCommentary('game_over', score);
    
    setTimeout(() => {
      const isHighScore = highScores.length < 10 || score > highScores[highScores.length - 1].score;
      if (isHighScore) {
        setGameState(GameState.ENTER_INITIALS);
      } else {
        setGameState(GameState.HIGH_SCORES);
      }
    }, 3000);
  };

  const submitScore = () => {
    const cleanInitials = initials.toUpperCase().slice(0, 3) || "UNK";
    const newEntry: HighScore = { name: cleanInitials, score: score, date: Date.now() };
    
    const newScores = [...highScores, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    setHighScores(newScores);
    localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(newScores));
    
    const index = newScores.findIndex(s => s.date === newEntry.date && s.score === newEntry.score);
    setNewHighScoreIndex(index);
    
    setGameState(GameState.HIGH_SCORES);
  };

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === GameState.ENTER_INITIALS) return;

      keysRef.current[e.code] = true;
      if (e.code === 'Space' && gameState === GameState.MENU) {
        startGame();
      }
      
      // Fire Missile
      if ((e.code === 'KeyM' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && gameState === GameState.PLAYING) {
          const ship = shipRef.current;
          if (ship && !ship.dead && ship.missileAmmo > 0) {
              ship.missileAmmo--;
              const nose = rotatePoint({ x: ship.radius, y: 0 }, ship.angle);
              missilesRef.current.push({
                  id: Math.random().toString(),
                  position: { x: ship.position.x + nose.x, y: ship.position.y + nose.y },
                  velocity: {
                      x: Math.cos(ship.angle) * MISSILE_SPEED,
                      y: Math.sin(ship.angle) * MISSILE_SPEED
                  },
                  angle: ship.angle,
                  radius: 5,
                  color: '#ef4444', // red
                  dead: false,
                  life: 3.0
              });
          }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // --- Game Loop ---
  const animate = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const deltaTime = (time - previousTimeRef.current) / 1000;
    previousTimeRef.current = time;
    let dt = Math.min(deltaTime, 0.1);

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    // Clear Screen
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render background grid
    // Matrix effect if Time Slow active
    const timeSlowActive = shipRef.current?.powerupTimeSlowTimer ? shipRef.current.powerupTimeSlowTimer > 0 : false;
    
    if (timeSlowActive) {
        ctx.strokeStyle = '#10b981'; // Green for matrix
        ctx.globalAlpha = 0.2;
    } else {
        ctx.strokeStyle = '#1e293b';
        ctx.globalAlpha = 1.0;
    }
    
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let x = 0; x < canvas.width; x+= 50) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for(let y = 0; y < canvas.height; y+= 50) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // 1. UPDATE LOGIC 
    if (gameState === GameState.PLAYING || gameState === GameState.GAME_OVER || gameState === GameState.LEVEL_TRANSITION) {
      const ship = shipRef.current;
      
      // Time Slow Factor
      // If time slow is active, enemies move at 0.3x speed. Player moves normal.
      const enemyDt = timeSlowActive ? dt * 0.3 : dt;

      // Ship Logic
      if (gameState === GameState.PLAYING && ship && !ship.dead) {
        // Decrement PowerUp Timers
        if (ship.powerupMultiShotTimer > 0) ship.powerupMultiShotTimer -= dt;
        if (ship.powerupShieldTimer > 0) ship.powerupShieldTimer -= dt;
        if (ship.powerupTimeSlowTimer > 0) ship.powerupTimeSlowTimer -= dt;

        if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) {
          ship.angle -= TURN_SPEED * dt;
        }
        if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) {
          ship.angle += TURN_SPEED * dt;
        }
        if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) {
          ship.thrusting = true;
          ship.velocity.x += Math.cos(ship.angle) * THRUST_POWER * dt;
          ship.velocity.y += Math.sin(ship.angle) * THRUST_POWER * dt;

          if (Math.random() > 0.5) {
            const offset = rotatePoint({ x: -ship.radius, y: 0 }, ship.angle);
            particlesRef.current.push({
                id: Math.random().toString(),
                position: { x: ship.position.x + offset.x, y: ship.position.y + offset.y },
                velocity: {
                  x: -Math.cos(ship.angle) * randomRange(50, 100),
                  y: -Math.sin(ship.angle) * randomRange(50, 100)
                },
                angle: 0,
                radius: 2,
                color: '#3b82f6',
                dead: false,
                life: 0.3,
                maxLife: 0.3,
                size: 2
            });
          }
        } else {
          ship.thrusting = false;
        }

        // Shoot
        if (ship.cooldown > 0) ship.cooldown -= dt;
        if ((keysRef.current['Space'] || keysRef.current['ControlLeft']) && ship.cooldown <= 0) {
          ship.cooldown = FIRE_RATE;
          
          const fireBullet = (angleOffset: number) => {
              const fireAngle = ship.angle + angleOffset;
              const nose = rotatePoint({ x: ship.radius, y: 0 }, fireAngle);
              bulletsRef.current.push({
                id: Math.random().toString(),
                position: { x: ship.position.x + nose.x, y: ship.position.y + nose.y },
                velocity: {
                  x: Math.cos(fireAngle) * BULLET_SPEED,
                  y: Math.sin(fireAngle) * BULLET_SPEED,
                },
                angle: fireAngle,
                radius: 2,
                color: '#facc15', 
                dead: false,
                life: BULLET_LIFE,
                owner: 'ship'
              });
          };

          fireBullet(0); // Center shot
          
          if (ship.powerupMultiShotTimer > 0) {
              fireBullet(-0.2); // Left shot
              fireBullet(0.2);  // Right shot
          }
        }

        ship.position.x += ship.velocity.x * dt;
        ship.position.y += ship.velocity.y * dt;
        ship.position = wrapPosition(ship.position, canvas.width, canvas.height);

        if (ship.invulnerable > 0) ship.invulnerable -= dt;
      }

      // UFO Logic
      if (gameState === GameState.PLAYING) {
          if (!ufoRef.current) {
             if (Date.now() - lastUfoSpawnTimeRef.current > nextUfoSpawnDelayRef.current) {
                 spawnUfo(canvas.width, canvas.height);
                 lastUfoSpawnTimeRef.current = Date.now();
                 nextUfoSpawnDelayRef.current = randomRange(UFO_SPAWN_RATE_MIN, UFO_SPAWN_RATE_MAX);
             }
          } else {
             const ufo = ufoRef.current;
             ufo.position.x += ufo.velocity.x * enemyDt;
             ufo.position.y += ufo.velocity.y * enemyDt;
             
             ufo.directionChangeTimer -= enemyDt;
             if (ufo.directionChangeTimer <= 0) {
                 ufo.directionChangeTimer = randomRange(1, 3);
                 ufo.velocity.y = randomRange(-50, 50);
             }

             if ((ufo.velocity.x > 0 && ufo.position.x > canvas.width + 50) || 
                 (ufo.velocity.x < 0 && ufo.position.x < -50)) {
                 ufoRef.current = null;
                 lastUfoSpawnTimeRef.current = Date.now();
             }

             ufo.shootCooldown -= enemyDt;
             if (ufo.shootCooldown <= 0 && ship && !ship.dead) {
                 ufo.shootCooldown = UFO_FIRE_RATE;
                 const angleToShip = Math.atan2(ship.position.y - ufo.position.y, ship.position.x - ufo.position.x);
                 const accuracyOffset = randomRange(-0.2, 0.2);
                 
                 bulletsRef.current.push({
                     id: Math.random().toString(),
                     position: { ...ufo.position },
                     velocity: {
                         x: Math.cos(angleToShip + accuracyOffset) * UFO_BULLET_SPEED,
                         y: Math.sin(angleToShip + accuracyOffset) * UFO_BULLET_SPEED
                     },
                     angle: 0,
                     radius: 3,
                     color: '#22c55e',
                     dead: false,
                     life: BULLET_LIFE,
                     owner: 'ufo'
                 });
             }
          }
      }

      // Bullets Update
      bulletsRef.current.forEach(b => {
        // If bullet owner is UFO, use enemyDt. Else use dt.
        const bulletDt = b.owner === 'ufo' ? enemyDt : dt;
        
        b.position.x += b.velocity.x * bulletDt;
        b.position.y += b.velocity.y * bulletDt;
        b.life -= bulletDt;
        if (b.life <= 0) b.dead = true;
      });
      bulletsRef.current = bulletsRef.current.filter(b => !b.dead);

      // Missiles Update
      missilesRef.current.forEach(m => {
          // Homing Logic
          if (ufoRef.current) {
              const target = ufoRef.current;
              const angleToTarget = Math.atan2(target.position.y - m.position.y, target.position.x - m.position.x);
              const currentAngle = Math.atan2(m.velocity.y, m.velocity.x);
              let diff = normalizeAngle(angleToTarget - currentAngle);
              
              // Turn towards target
              const turn = Math.min(Math.abs(diff), MISSILE_TURN_SPEED * dt) * Math.sign(diff);
              const newAngle = currentAngle + turn;
              
              m.velocity.x = Math.cos(newAngle) * MISSILE_SPEED;
              m.velocity.y = Math.sin(newAngle) * MISSILE_SPEED;
              m.angle = newAngle;
          }

          m.position.x += m.velocity.x * dt;
          m.position.y += m.velocity.y * dt;
          m.life -= dt;
          if (m.life <= 0) m.dead = true;

          // Emit smoke
          if (Math.random() > 0.5) {
             particlesRef.current.push({
                id: Math.random().toString(),
                position: { ...m.position },
                velocity: { x: 0, y: 0 },
                angle: 0,
                radius: 2,
                color: '#9ca3af',
                dead: false,
                life: 0.5,
                maxLife: 0.5,
                size: 2
             });
          }
      });
      missilesRef.current = missilesRef.current.filter(m => !m.dead);

      // Asteroids Update
      asteroidsRef.current.forEach(a => {
        a.position.x += a.velocity.x * enemyDt;
        a.position.y += a.velocity.y * enemyDt;
        a.angle += a.rotationSpeed * enemyDt;
        a.position = wrapPosition(a.position, canvas.width, canvas.height);
      });

      // PowerUps Update
      powerUpsRef.current.forEach(p => {
          p.position.x += p.velocity.x * dt;
          p.position.y += p.velocity.y * dt;
          p.life -= dt;
          if (p.life <= 0) p.dead = true;
          p.position = wrapPosition(p.position, canvas.width, canvas.height);
      });
      powerUpsRef.current = powerUpsRef.current.filter(p => !p.dead);

      // Particles
      particlesRef.current.forEach(p => {
        p.position.x += p.velocity.x * dt;
        p.position.y += p.velocity.y * dt;
        p.life -= dt;
        if (p.life <= 0) p.dead = true;
      });
      particlesRef.current = particlesRef.current.filter(p => !p.dead);

      // Collisions
      if (gameState === GameState.PLAYING) {
        
        // 1. Ship Picking up PowerUps
        if (ship && !ship.dead) {
            for (const p of powerUpsRef.current) {
                if (checkCollision({ ...ship, radius: ship.radius * 1.5 }, p)) {
                    p.dead = true;
                    // Apply Effect
                    switch (p.type) {
                        case 'MULTI_SHOT':
                            ship.powerupMultiShotTimer = POWERUP_DURATION;
                            break;
                        case 'SHIELD':
                            ship.powerupShieldTimer = POWERUP_DURATION;
                            break;
                        case 'TIME_SLOW':
                            ship.powerupTimeSlowTimer = POWERUP_DURATION;
                            break;
                        case 'MISSILE':
                            ship.missileAmmo += 1;
                            break;
                    }
                    // Sound/Text effect
                    setAiMessage(`ACQUIRED: ${p.type.replace('_', ' ')}`);
                }
            }
        }

        // 2. Bullets
        for (const b of bulletsRef.current) {
          if (b.dead) continue;

          if (b.owner === 'ship') {
              // Vs Asteroids
              for (const a of asteroidsRef.current) {
                if (!a.dead && checkCollision(b, a)) {
                  b.dead = true;
                  a.dead = true;
                  spawnPowerUp(a.position); // Chance to drop powerup
                  createExplosion(a.position, a.color, 10);
                  setScore(prev => prev + (a.size === 'large' ? 20 : a.size === 'medium' ? 50 : 100));

                  if (a.size !== 'small') {
                    const nextSize = a.size === 'large' ? 'medium' : 'small';
                    const config = ASTEROID_CONFIG[nextSize];
                    for (let i = 0; i < 2; i++) {
                      const angle = randomRange(0, Math.PI * 2);
                      const speed = config.speed * randomRange(0.8, 1.2);
                      asteroidsRef.current.push({
                        id: Math.random().toString(),
                        position: { ...a.position },
                        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
                        angle: 0,
                        rotationSpeed: randomRange(-2, 2),
                        radius: config.radius,
                        color: a.color,
                        dead: false,
                        size: nextSize,
                        vertices: generateAsteroidVertices(config.radius, nextSize === 'medium' ? 8 : 6),
                      });
                    }
                  }
                  break;
                }
              }

              // Vs UFO
              if (ufoRef.current && !b.dead && checkCollision(b, ufoRef.current)) {
                  b.dead = true;
                  spawnPowerUp(ufoRef.current.position); // High chance/Always logic if wanted, but reusing function for now
                  createExplosion(ufoRef.current.position, ufoRef.current.color, 20);
                  ufoRef.current = null; // Destroy UFO
                  lastUfoSpawnTimeRef.current = Date.now();
                  setScore(prev => prev + 500);
              }
          }
          
          // UFO Bullets hitting Ship
          if (b.owner === 'ufo' && ship && !ship.dead && ship.invulnerable <= 0) {
             // Check shield
             if (ship.powerupShieldTimer > 0) {
                 // Shield hit logic
                 if (checkCollision(b, { ...ship, radius: ship.radius * 2 })) { // Shield is bigger
                    b.dead = true;
                    // Maybe flash shield?
                 }
             } else {
                 if (checkCollision(b, { ...ship, radius: ship.radius * 0.7 })) {
                     b.dead = true;
                     ship.dead = true;
                     createExplosion(ship.position, ship.color, 30);
                     setLives(l => {
                         const newLives = l - 1;
                         if (newLives <= 0) handleGameOver();
                         else setTimeout(() => { if (lives > 0) resetShip(canvas.width, canvas.height); }, 2000);
                         return newLives;
                     });
                 }
             }
          }
        }
        asteroidsRef.current = asteroidsRef.current.filter(a => !a.dead);

        // 3. Missiles Collision
        for (const m of missilesRef.current) {
            if (m.dead) continue;
            
            // Hit UFO
            if (ufoRef.current && checkCollision(m, ufoRef.current)) {
                m.dead = true;
                spawnPowerUp(ufoRef.current.position);
                createExplosion(ufoRef.current.position, ufoRef.current.color, 30);
                ufoRef.current = null;
                lastUfoSpawnTimeRef.current = Date.now();
                setScore(prev => prev + 500);
                continue;
            }
            
            // Hit Asteroid
            for (const a of asteroidsRef.current) {
                if (!a.dead && checkCollision(m, a)) {
                    m.dead = true;
                    a.dead = true;
                    createExplosion(a.position, a.color, 15);
                    setScore(prev => prev + 50); // Less score for wasting missile on asteroid
                    // No split for missile hits? Or yes? Let's just destroy it utterly.
                    break;
                }
            }
        }

        // 4. Ship vs Bodies
        if (ship && !ship.dead && ship.invulnerable <= 0) {
          const checkDeath = (obj: { position: Point, radius: number }) => {
             if (ship.powerupShieldTimer > 0) return false; // Invincible with shield
             return checkCollision({ ...ship, radius: ship.radius * 0.7 }, obj);
          };

          for (const a of asteroidsRef.current) {
            if (checkDeath(a)) {
              ship.dead = true;
              createExplosion(ship.position, ship.color, 30);
              setLives(l => {
                  const newLives = l - 1;
                  if (newLives <= 0) {
                      handleGameOver();
                  } else {
                      setTimeout(() => {
                        if (lives > 0) resetShip(canvas.width, canvas.height);
                      }, 2000);
                  }
                  return newLives;
              });
              break;
            }
          }
          
          if (ufoRef.current && !ship.dead) {
              if (checkDeath(ufoRef.current)) {
                   ship.dead = true;
                   createExplosion(ship.position, ship.color, 30);
                   createExplosion(ufoRef.current.position, ufoRef.current.color, 20);
                   ufoRef.current = null;
                   lastUfoSpawnTimeRef.current = Date.now();

                   setLives(l => {
                      const newLives = l - 1;
                      if (newLives <= 0) {
                          handleGameOver();
                      } else {
                          setTimeout(() => {
                            if (lives > 0) resetShip(canvas.width, canvas.height);
                          }, 2000);
                      }
                      return newLives;
                   });
              }
          }
        }
      }

      // Level Clear
      if (asteroidsRef.current.length === 0 && !ufoRef.current && gameState === GameState.PLAYING) {
         startNextLevel();
      }
    }

    // 2. RENDER LOGIC

    // Draw Particles
    particlesRef.current.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.position.x, p.position.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });

    // Draw PowerUps
    powerUpsRef.current.forEach(p => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw Icon/Letter
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let label = '';
        switch(p.type) {
            case 'MULTI_SHOT': label = 'T'; break; // Turbo
            case 'SHIELD': label = 'S'; break;
            case 'TIME_SLOW': label = 'C'; break; // Chronos
            case 'MISSILE': label = 'M'; break; // Missile
        }
        ctx.fillText(label, p.position.x, p.position.y);
    });
    ctx.shadowBlur = 0;

    // Draw Bullets
    bulletsRef.current.forEach(b => {
      ctx.shadowBlur = 10;
      ctx.shadowColor = b.color;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Draw Missiles
    missilesRef.current.forEach(m => {
        ctx.save();
        ctx.translate(m.position.x, m.position.y);
        ctx.rotate(m.angle);
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = m.color;
        ctx.fillStyle = m.color;
        
        // Rocket shape
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    });

    // Draw UFO
    if (ufoRef.current) {
        const u = ufoRef.current;
        ctx.save();
        ctx.translate(u.position.x, u.position.y);
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = u.color;
        ctx.strokeStyle = u.color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.ellipse(0, 0, u.radius, u.radius * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(0, -u.radius * 0.2, u.radius * 0.5, Math.PI, 0);
        ctx.stroke();
        
        ctx.restore();
    }

    // Draw Asteroids
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#ec4899';
    asteroidsRef.current.forEach(a => {
      ctx.save();
      ctx.translate(a.position.x, a.position.y);
      ctx.rotate(a.angle);
      ctx.beginPath();
      a.vertices.forEach((v, i) => {
        if (i === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });

    // Draw Ship
    const ship = shipRef.current;
    if (ship && !ship.dead && (gameState === GameState.PLAYING || gameState === GameState.GAME_OVER || gameState === GameState.LEVEL_TRANSITION)) {
      if (ship.invulnerable <= 0 || Math.floor(Date.now() / 100) % 2 === 0) {
        ctx.save();
        ctx.translate(ship.position.x, ship.position.y);
        
        // Draw Shield
        if (ship.powerupShieldTimer > 0) {
            // Warning flash for shield expiring
            let shieldColor = '#3b82f6';
            if (ship.powerupShieldTimer < 3.0 && Math.floor(Date.now() / 200) % 2 === 0) {
                shieldColor = '#ffffff'; // Flash white
            }

            ctx.strokeStyle = shieldColor;
            ctx.shadowColor = shieldColor;
            ctx.shadowBlur = 10 + Math.sin(Date.now() / 100) * 5;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, ship.radius * 1.6, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.rotate(ship.angle);
        
        // Powerup Ending Warning for Ship Body
        let shipColor = '#22d3ee';
        const warningThreshold = 3.0;
        const isPowerupLow = (ship.powerupMultiShotTimer > 0 && ship.powerupMultiShotTimer < warningThreshold) ||
                             (ship.powerupTimeSlowTimer > 0 && ship.powerupTimeSlowTimer < warningThreshold);
        
        if (isPowerupLow && Math.floor(Date.now() / 200) % 2 === 0) {
             shipColor = '#facc15'; // Flash yellow
        }

        ctx.strokeStyle = shipColor;
        ctx.shadowColor = shipColor; // Matching shadow
        ctx.shadowBlur = 15;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(ship.radius, 0);
        ctx.lineTo(-ship.radius, -ship.radius / 1.5);
        ctx.lineTo(-ship.radius / 2, 0);
        ctx.lineTo(-ship.radius, ship.radius / 1.5);
        ctx.closePath();
        ctx.stroke();

        if (ship.thrusting) {
          ctx.strokeStyle = '#f97316';
          ctx.shadowColor = '#f97316';
          ctx.beginPath();
          ctx.moveTo(-ship.radius / 2, 0);
          ctx.lineTo(-ship.radius * 1.5, 0);
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    }
  }, []);

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* HUD */}
      {(gameState === GameState.PLAYING || gameState === GameState.GAME_OVER || gameState === GameState.LEVEL_TRANSITION) && (
        <>
            <div className="absolute top-4 left-4 text-cyan-400 font-mono text-xl tracking-widest pointer-events-none select-none drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]">
                SCORE: {score}
            </div>
            <div className="absolute top-4 right-4 text-pink-400 font-mono text-xl tracking-widest pointer-events-none select-none drop-shadow-[0_0_5px_rgba(244,114,182,0.8)]">
                LIVES: {Array(Math.max(0, lives)).fill('▲').join(' ')}
            </div>
            
            {/* Power Up HUD */}
            <div className="absolute top-14 left-4 flex flex-col gap-2 pointer-events-none select-none">
                {shipRef.current?.powerupMultiShotTimer! > 0 && (
                     <div className={`${shipRef.current!.powerupMultiShotTimer < 3 ? 'text-red-400 animate-pulse' : 'text-yellow-400'} font-mono text-sm drop-shadow-md`}>
                        MULTI-SHOT: {Math.ceil(shipRef.current!.powerupMultiShotTimer)}s
                     </div>
                )}
                {shipRef.current?.powerupShieldTimer! > 0 && (
                     <div className={`${shipRef.current!.powerupShieldTimer < 3 ? 'text-red-400 animate-pulse' : 'text-blue-400'} font-mono text-sm drop-shadow-md`}>
                        SHIELD: {Math.ceil(shipRef.current!.powerupShieldTimer)}s
                     </div>
                )}
                {shipRef.current?.powerupTimeSlowTimer! > 0 && (
                     <div className={`${shipRef.current!.powerupTimeSlowTimer < 3 ? 'text-red-400 animate-pulse' : 'text-purple-400'} font-mono text-sm drop-shadow-md`}>
                        TIME SLOW: {Math.ceil(shipRef.current!.powerupTimeSlowTimer)}s
                     </div>
                )}
                {shipRef.current?.missileAmmo! > 0 && (
                     <div className="text-red-500 font-mono text-sm drop-shadow-md">
                        MISSILES [M]: {shipRef.current!.missileAmmo}
                     </div>
                )}
            </div>
        </>
      )}
      
      {gameState === GameState.PLAYING && (
        <div className="absolute bottom-4 left-4 text-slate-500 font-mono text-sm pointer-events-none select-none">
            WASD / Arrows to Move • SPACE to Shoot • M to Fire Missile
        </div>
      )}

      {/* AI Log */}
      {(gameState === GameState.PLAYING || gameState === GameState.GAME_OVER || gameState === GameState.LEVEL_TRANSITION) && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 w-full max-w-2xl text-center pointer-events-none z-0">
            <div className={`inline-block px-4 py-2 rounded bg-slate-800/80 border border-slate-700 text-slate-200 font-mono text-sm transition-opacity duration-500 ${isAiLoading ? 'opacity-50' : 'opacity-100'}`}>
                <span className="text-cyan-500 font-bold mr-2">AI LOG:</span>
                {aiMessage}
            </div>
          </div>
      )}

      {/* Main Menu Overlay */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-10">
          <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-4 tracking-tighter" style={{ filter: 'drop-shadow(0 0 10px rgba(34,211,238,0.5))' }}>
            ASTEROIDS
          </h1>
          <p className="text-cyan-200 font-mono mb-8 text-lg tracking-wide animate-pulse">
            PRESS SPACE TO START
          </p>
          <button 
            onClick={startGame}
            className="px-6 py-2 bg-slate-800 border border-cyan-500/50 text-cyan-400 rounded hover:bg-slate-700 hover:border-cyan-400 transition-all mb-4"
          >
            INITIATE LAUNCH
          </button>
          
          <button 
            onClick={() => setGameState(GameState.HIGH_SCORES)}
            className="text-sm text-slate-400 hover:text-white font-mono underline decoration-slate-600 underline-offset-4"
          >
            VIEW HIGH SCORES
          </button>
        </div>
      )}

      {/* Level Transition Overlay */}
      {gameState === GameState.LEVEL_TRANSITION && (
         <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/20">
            <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white tracking-widest animate-bounce drop-shadow-lg">
               LEVEL {level}
            </h2>
         </div>
      )}

      {/* Transient Game Over Text */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <h2 className="text-7xl md:text-9xl font-black text-red-500 tracking-widest animate-pulse" style={{ textShadow: '0 0 30px rgba(239,68,68,0.8)' }}>
            GAME OVER
          </h2>
        </div>
      )}

      {/* Enter Initials Screen */}
      {gameState === GameState.ENTER_INITIALS && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 z-30">
          <h2 className="text-4xl text-yellow-400 font-bold mb-2 tracking-wider shadow-yellow-400/50 drop-shadow-md">NEW HIGH SCORE!</h2>
          <p className="text-slate-300 font-mono mb-8">ENTER YOUR INITIALS</p>
          
          <div className="text-6xl font-mono text-white mb-8 tracking-[0.5em]">
             <input 
               type="text" 
               maxLength={3}
               value={initials}
               onChange={(e) => setInitials(e.target.value.toUpperCase())}
               className="bg-transparent border-b-4 border-cyan-500 outline-none text-center w-48 placeholder-slate-700 focus:border-pink-500 transition-colors"
               autoFocus
               placeholder="_ _ _"
             />
          </div>
          
          <div className="text-2xl text-cyan-400 font-mono mb-8">SCORE: {score}</div>
          
          <button
            onClick={submitScore}
            disabled={initials.length === 0}
            className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded text-xl transition-all shadow-[0_0_15px_rgba(8,145,178,0.5)] hover:shadow-[0_0_25px_rgba(6,182,212,0.8)]"
          >
            SUBMIT
          </button>
        </div>
      )}

      {/* High Scores Screen */}
      {gameState === GameState.HIGH_SCORES && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-30 p-4">
          <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 mb-8 tracking-widest drop-shadow-sm">
            HIGH SCORES
          </h2>
          
          <div className="w-full max-w-md bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8 backdrop-blur-sm shadow-2xl">
             <table className="w-full font-mono text-lg">
                <thead>
                   <tr className="text-slate-500 border-b border-slate-700">
                      <th className="text-left pb-2">RANK</th>
                      <th className="text-center pb-2">PILOT</th>
                      <th className="text-right pb-2">SCORE</th>
                   </tr>
                </thead>
                <tbody>
                   {highScores.map((entry, i) => (
                      <tr key={i} className={`
                        ${newHighScoreIndex === i ? 'text-yellow-400 animate-pulse font-bold' : 'text-cyan-300'} 
                        hover:bg-slate-700/50 transition-colors
                      `}>
                         <td className="py-2 text-left text-slate-400">{i + 1}</td>
                         <td className="py-2 text-center tracking-widest">{entry.name}</td>
                         <td className="py-2 text-right">{entry.score.toLocaleString()}</td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
          
          <div className="flex gap-4">
              <button
                onClick={() => setGameState(GameState.MENU)}
                className="px-6 py-2 border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 rounded font-mono transition-all"
              >
                MAIN MENU
              </button>
              <button
                onClick={startGame}
                className="px-8 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded font-mono transition-all shadow-[0_0_15px_rgba(8,145,178,0.5)]"
              >
                NEW GAME
              </button>
          </div>
        </div>
      )}
    </div>
  );
};
