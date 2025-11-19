
import { Point, Asteroid } from '../types';

export const DEG_TO_RAD = Math.PI / 180;

export function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function distance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function rotatePoint(p: Point, angle: number): Point {
  return {
    x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
  };
}

export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function generateAsteroidVertices(radius: number, numVertices: number): Point[] {
  const vertices: Point[] = [];
  for (let i = 0; i < numVertices; i++) {
    const angle = (i / numVertices) * Math.PI * 2;
    // Vary the radius slightly for jagged look
    const r = radius * randomRange(0.7, 1.3);
    vertices.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  }
  return vertices;
}

export function checkCollision(e1: { position: Point; radius: number }, e2: { position: Point; radius: number }): boolean {
  // Simple circle collision for performance
  return distance(e1.position, e2.position) < (e1.radius + e2.radius);
}

export function wrapPosition(pos: Point, width: number, height: number): Point {
  let x = pos.x;
  let y = pos.y;

  if (x < 0) x = width;
  if (x > width) x = 0;
  if (y < 0) y = height;
  if (y > height) y = 0;

  return { x, y };
}
