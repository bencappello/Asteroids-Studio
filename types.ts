
export interface Point {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Point;
  velocity: Velocity;
  angle: number; // in radians
  radius: number;
  color: string;
  dead: boolean;
}

export interface Ship extends Entity {
  rotationSpeed: number;
  thrusting: boolean;
  invulnerable: number; // frames
  cooldown: number;
  
  // PowerUps
  powerupMultiShotTimer: number;
  powerupShieldTimer: number;
  powerupTimeSlowTimer: number;
  missileAmmo: number;
}

export interface Ufo extends Entity {
  directionChangeTimer: number;
  shootCooldown: number;
  accuracy: number; // 0 to 1
}

export interface Asteroid extends Entity {
  size: 'large' | 'medium' | 'small';
  vertices: Point[]; // Relative to center
  rotationSpeed: number;
}

export interface Bullet extends Entity {
  life: number;
  owner: 'ship' | 'ufo';
}

export interface Particle extends Entity {
  life: number;
  maxLife: number;
  size: number;
}

export type PowerUpType = 'MULTI_SHOT' | 'SHIELD' | 'TIME_SLOW' | 'MISSILE';

export interface PowerUp extends Entity {
  type: PowerUpType;
  life: number;
}

export interface Missile extends Entity {
  life: number;
  targetId?: string;
}

export interface HighScore {
  name: string;
  score: number;
  date: number;
}

export enum GameState {
  MENU,
  PLAYING,
  GAME_OVER,      // Transient state showing "GAME OVER" text
  ENTER_INITIALS, // Input screen for high score
  HIGH_SCORES,    // Leaderboard screen
  LEVEL_TRANSITION
}
