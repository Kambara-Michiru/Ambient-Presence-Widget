export type Status = 'OFFLINE' | 'SLEEPING' | 'IDLE' | 'ACTIVE' | 'CELEBRATING';

export type PresenceEventType = 'session_start' | 'task_complete' | 'away' | 'back' | 'logout';

export type PresenceEvent = {
  event: PresenceEventType;
  buddyId: string;
  privacyLevel: 1 | 2 | 3 | 4;
  intensity: number;
  categoryHue: number;
  ts: string;
};

export type PresenceState = {
  status: Status;
  buddyId: string | null;
  privacyLevel: 1 | 2 | 3 | 4;
  intensity: number;
  categoryHue: number;
  lastEventTs: Date | null;
};

export type DrawCommand = {
  x: number;
  y: number;
  radius: number;
  scale: number;
  hsl: [number, number, number];
  opacity: number;
  glowBlur: number;
  glowColor: string;
  showLottie: boolean;
};

export type AnimParams = {
  hsl: [number, number, number];
  opacity: number;
  scaleMid: number;
  scaleAmp: number;
  periodRange: [number, number];
  walkForce: number;
  glowBlur: number;
};

export type Vec2 = { x: number; y: number };
export type Rect = { w: number; h: number };
