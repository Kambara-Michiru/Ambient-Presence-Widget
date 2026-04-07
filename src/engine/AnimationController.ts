import { createNoise2D } from 'simplex-noise';
import type { AnimParams, DrawCommand, Rect, Status, Vec2 } from '../types/animation';

const ANIM_PARAMS: Record<Status, AnimParams> = {
  OFFLINE: {
    hsl: [220, 10, 70],
    opacity: 0.20,
    scaleMid: 0.60,
    scaleAmp: 0,
    periodRange: [0, 0],
    walkForce: 0,
    glowBlur: 0,
  },
  SLEEPING: {
    hsl: [220, 15, 70],
    opacity: 0.45,
    scaleMid: 0.50,
    scaleAmp: 0.04,
    periodRange: [8000, 8000],
    walkForce: 0,
    glowBlur: 0,
  },
  IDLE: {
    hsl: [220, 20, 75],
    opacity: 0.75,
    scaleMid: 1.00,
    scaleAmp: 0.08,
    periodRange: [4000, 6000],
    walkForce: 0.08,
    glowBlur: 0,
  },
  ACTIVE: {
    hsl: [25, 80, 55],
    opacity: 1.00,
    scaleMid: 1.00,
    scaleAmp: 0.08,
    periodRange: [2000, 3000],
    walkForce: 0.03,
    glowBlur: 4,
  },
  CELEBRATING: {
    hsl: [45, 90, 55],
    opacity: 1.00,
    scaleMid: 1.20,
    scaleAmp: 0,
    periodRange: [0, 0],
    walkForce: 0,
    glowBlur: 8,
  },
};

const MAX_VEL = 1.2;
const WALL_MARGIN = 4;
const SPARK_INTERVAL_RANGE: [number, number] = [8000, 15000];
const SPARK_DURATION_MS = 100;
const SPARK_PEAK_SCALE = 1.15;
const BASE_RADIUS = 10;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function samplePeriod([min, max]: [number, number]): number {
  if (min === 0 && max === 0) return 0;
  return min + Math.random() * (max - min);
}

function breathScale(elapsed: number, period: number, amp: number, mid: number): number {
  if (period === 0) return mid;
  return mid + amp * Math.sin((2 * Math.PI * elapsed) / period);
}

function sparkScale(elapsed: number, sparkStart: number | null): number {
  if (sparkStart === null) return 1.0;
  const t = (elapsed - sparkStart) / SPARK_DURATION_MS;
  if (t < 0 || t > 1) return 1.0;
  return 1.0 + (SPARK_PEAK_SCALE - 1.0) * Math.sin(t * Math.PI);
}

function stepWalk(
  pos: Vec2,
  vel: Vec2,
  t: number,
  force: number,
  bounds: Rect,
  noise2D: (x: number, y: number) => number,
): [Vec2, Vec2] {
  if (force === 0) return [pos, vel];
  const nx = noise2D(t * 0.0008, 0);
  const ny = noise2D(0, t * 0.0008);

  let vx = clamp(vel.x + nx * force, -MAX_VEL, MAX_VEL);
  let vy = clamp(vel.y + ny * force, -MAX_VEL, MAX_VEL);

  let x = pos.x + vx;
  let y = pos.y + vy;

  if (x < WALL_MARGIN || x > bounds.w - WALL_MARGIN) vx *= -1;
  if (y < WALL_MARGIN || y > bounds.h - WALL_MARGIN) vy *= -1;

  return [
    { x: clamp(x, WALL_MARGIN, bounds.w - WALL_MARGIN), y: clamp(y, WALL_MARGIN, bounds.h - WALL_MARGIN) },
    { x: vx, y: vy },
  ];
}

export class AnimationController {
  private noise2D = createNoise2D();
  private pos: Vec2 = { x: 32, y: 32 };
  private vel: Vec2 = { x: 0, y: 0 };
  private breathPeriod = 4000;
  private startTs = 0;
  private prevStatus: Status | null = null;
  private sparkStart: number | null = null;
  private nextSparkTs = 0;
  private onComplete: (() => void) | null = null;
  private celebratingFired = false;
  private bounds: Rect = { w: 64, h: 64 };

  setOnComplete(cb: () => void) {
    this.onComplete = cb;
  }

  setBounds(bounds: Rect) {
    this.bounds = bounds;
    this.pos = { x: bounds.w / 2, y: bounds.h / 2 };
  }

  tick(ts: number, status: Status): DrawCommand {
    const params = ANIM_PARAMS[status];

    // State change: re-initialize
    if (status !== this.prevStatus) {
      this.prevStatus = status;
      this.startTs = ts;
      this.breathPeriod = samplePeriod(params.periodRange);
      this.sparkStart = null;
      this.celebratingFired = false;
      if (status !== 'CELEBRATING') {
        this.nextSparkTs =
          ts +
          SPARK_INTERVAL_RANGE[0] +
          Math.random() * (SPARK_INTERVAL_RANGE[1] - SPARK_INTERVAL_RANGE[0]);
      }
    }

    const elapsed = ts - this.startTs;

    // Fire onComplete after celebrating animation duration (2500ms)
    if (status === 'CELEBRATING' && !this.celebratingFired && elapsed >= 2500) {
      this.celebratingFired = true;
      this.onComplete?.();
    }

    // Random walk
    const [newPos, newVel] = stepWalk(this.pos, this.vel, ts, params.walkForce, this.bounds, this.noise2D);
    this.pos = newPos;
    this.vel = newVel;

    // Spark logic (ACTIVE only)
    if (status === 'ACTIVE' && ts >= this.nextSparkTs && this.sparkStart === null) {
      this.sparkStart = ts;
      this.nextSparkTs =
        ts +
        SPARK_INTERVAL_RANGE[0] +
        Math.random() * (SPARK_INTERVAL_RANGE[1] - SPARK_INTERVAL_RANGE[0]);
    }
    if (this.sparkStart !== null && ts - this.sparkStart > SPARK_DURATION_MS) {
      this.sparkStart = null;
    }

    const breath = breathScale(elapsed, this.breathPeriod, params.scaleAmp, params.scaleMid);
    const spark = status === 'ACTIVE' ? sparkScale(ts, this.sparkStart) : 1.0;
    const scale = breath * spark;

    const showLottie = status === 'CELEBRATING';

    return {
      x: this.pos.x,
      y: this.pos.y,
      radius: BASE_RADIUS,
      scale,
      hsl: params.hsl,
      opacity: params.opacity,
      glowBlur: params.glowBlur,
      glowColor: `hsla(${params.hsl[0]}, ${params.hsl[1]}%, ${params.hsl[2]}%, 0.6)`,
      showLottie,
    };
  }
}
