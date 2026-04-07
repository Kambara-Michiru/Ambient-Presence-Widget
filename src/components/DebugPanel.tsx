import type { PresenceEventType, Status } from '../types/animation';
import { usePresenceStore } from '../stores/presenceStore';

const STATUS_COLORS: Record<Status, string> = {
  OFFLINE:    '#6b7280',
  SLEEPING:   '#93c5fd',
  IDLE:       '#60a5fa',
  ACTIVE:     '#fb923c',
  CELEBRATING:'#fbbf24',
};

const isTauri = '__TAURI_INTERNALS__' in window;

export function DebugPanel() {
  const { status, dispatch } = usePresenceStore();

  const fire = (event: PresenceEventType) => {
    dispatch({
      event,
      buddyId: 'buddy-001',
      privacyLevel: 2,
      intensity: 0.7,
      categoryHue: 220,
      ts: new Date().toISOString(),
    });
  };

  return (
    <div style={{
      background: 'rgba(0,0,0,0.6)',
      color: 'white',
      padding: '10px 12px',
      borderRadius: '8px',
      fontSize: '11px',
      fontFamily: 'monospace',
      width: 140,
    }}>
      {/* ステータス表示 */}
      <div style={{ marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{
          display: 'inline-block',
          width: 8, height: 8, borderRadius: '50%',
          background: STATUS_COLORS[status],
          flexShrink: 0,
        }} />
        <span style={{ fontWeight: 700, fontSize: 10 }}>{status}</span>
        <span style={{
          marginLeft: 'auto',
          background: isTauri ? '#22c55e' : '#f59e0b',
          color: '#000',
          borderRadius: 3,
          padding: '0 4px',
          fontSize: '9px',
          fontWeight: 700,
        }}>
          {isTauri ? 'WS' : 'MOCK'}
        </span>
      </div>

      {/* イベントボタン */}
      {(['session_start', 'task_complete', 'away', 'back', 'logout'] as PresenceEventType[]).map(ev => (
        <button
          key={ev}
          onClick={() => fire(ev)}
          style={{
            display: 'block',
            width: '100%',
            marginBottom: 3,
            padding: '3px 6px',
            cursor: 'pointer',
            fontSize: '10px',
            background: 'rgba(255,255,255,0.08)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            textAlign: 'left',
          }}
        >
          {ev}
        </button>
      ))}
    </div>
  );
}
