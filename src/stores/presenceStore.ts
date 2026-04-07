import { create } from 'zustand';
import type { PresenceEvent, PresenceEventType, PresenceState, Status } from '../types/animation';

function transition(status: Status, event: PresenceEvent): Partial<PresenceState> {
  const base: Partial<PresenceState> = {
    buddyId: event.buddyId,
    privacyLevel: event.privacyLevel,
    intensity: event.intensity,
    categoryHue: event.categoryHue,
    lastEventTs: new Date(event.ts),
  };

  switch (event.event) {
    case 'logout':
      return { ...base, status: 'OFFLINE' };
    case 'session_start':
      return { ...base, status: 'ACTIVE' };
    case 'task_complete':
      return { ...base, status: 'CELEBRATING' };
    case 'away':
      return { ...base, status: 'SLEEPING' };
    case 'back':
      if (status === 'SLEEPING') return { ...base, status: 'IDLE' };
      return base;
    default:
      return base;
  }
}

type PresenceStore = PresenceState & {
  dispatch: (event: PresenceEvent) => void;
  setStatus: (status: Status) => void;
};

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  status: 'OFFLINE',
  buddyId: null,
  privacyLevel: 2,
  intensity: 0,
  categoryHue: 220,
  lastEventTs: null,

  dispatch(event: PresenceEvent) {
    const { status } = get();
    set(transition(status, event));
  },

  setStatus(status: Status) {
    set({ status });
  },
}));

// Tauri IPC listener — call once at app startup (inside App.tsx)
export async function initPresenceListener() {
  // Only run inside Tauri (not in plain browser/preview)
  if (!('__TAURI_INTERNALS__' in window)) return;

  const { listen } = await import('@tauri-apps/api/event');

  // Listen for presence events from Rust transport.
  // The Rust struct is serialized as snake_case, so we map to camelCase here.
  await listen<{
    event: string;
    buddy_id: string;
    privacy_level: number;
    intensity: number;
    category_hue: number;
    ts: string;
  }>('presence_event', ({ payload }) => {
    usePresenceStore.getState().dispatch({
      event: payload.event as PresenceEventType,
      buddyId: payload.buddy_id,
      privacyLevel: payload.privacy_level as 1 | 2 | 3 | 4,
      intensity: payload.intensity,
      categoryHue: payload.category_hue,
      ts: payload.ts,
    });
  });

  // When WS connects, transition from OFFLINE to IDLE (waiting for first event)
  await listen('ws_connected', () => {
    const { status, setStatus } = usePresenceStore.getState();
    if (status === 'OFFLINE') setStatus('IDLE');
  });

  // When WS disconnects, go OFFLINE
  await listen('ws_disconnected', () => {
    usePresenceStore.getState().setStatus('OFFLINE');
  });
}
