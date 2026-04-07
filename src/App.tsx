import { useEffect, useRef, useState } from 'react';
import { DotCanvas } from './components/DotCanvas';
import { LottieOverlay } from './components/LottieOverlay';
import { DebugPanel } from './components/DebugPanel';
import { AnimationController } from './engine/AnimationController';
import { usePresenceStore, initPresenceListener } from './stores/presenceStore';
import type { DrawCommand } from './types/animation';

const isDev = import.meta.env.DEV;

const controller = new AnimationController();
controller.setBounds({ w: 64, h: 64 });

export default function App() {
  const status = usePresenceStore(s => s.status);
  const setStatus = usePresenceStore(s => s.setStatus);
  const [cmd, setCmd] = useState<DrawCommand>({
    x: 32, y: 32, radius: 10, scale: 1.0,
    hsl: [220, 20, 75], opacity: 0.75, glowBlur: 0, glowColor: '', showLottie: false,
  });

  const rafId = useRef<number>(0);
  const lastFrameTs = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    // dev モードでは最初から IDLE にして dot を見えやすくする
    if (isDev) setStatus('IDLE');

    // Tauri 環境なら WS イベントリスナーを起動
    initPresenceListener();

    controller.setOnComplete(() => setStatus('IDLE'));
    controller.setBounds({ w: 64, h: 64 });
  }, [setStatus]);

  useEffect(() => {
    const TARGET_FPS = status === 'SLEEPING' ? 10 : 60;
    const FRAME_MS = 1000 / TARGET_FPS;

    const loop = (ts: number) => {
      if (ts - lastFrameTs.current >= FRAME_MS) {
        lastFrameTs.current = ts;
        if (statusRef.current !== 'OFFLINE') {
          const newCmd = controller.tick(ts, statusRef.current);
          setCmd(newCmd);
        }
      }
      rafId.current = requestAnimationFrame(loop);
    };

    if (status === 'OFFLINE') {
      cancelAnimationFrame(rafId.current);
    } else {
      rafId.current = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(rafId.current);
  }, [status]);

  // CELEBRATING → IDLE: setTimeout をフォールバックに使う（RAF がスロットリングされる環境対策）
  useEffect(() => {
    if (status !== 'CELEBRATING') return;
    const timer = setTimeout(() => setStatus('IDLE'), 2500);
    return () => clearTimeout(timer);
  }, [status, setStatus]);

  const handleCelebrateComplete = () => setStatus('IDLE');

  if (isDev) {
    // dev モード: 縦に並べたレイアウト（dot プレビュー + DebugPanel）
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(15, 15, 20, 0.92)',
        gap: 12,
        paddingTop: 16,
        boxSizing: 'border-box',
      }}>
        {/* dot プレビューエリア */}
        <div style={{
          width: 64,
          height: 64,
          position: 'relative',
          borderRadius: 8,
          outline: '1px dashed rgba(255,255,255,0.15)',
        }}>
          <DotCanvas cmd={cmd} />
          {status === 'CELEBRATING' && <LottieOverlay onComplete={handleCelebrateComplete} />}
        </div>

        {/* DebugPanel（通常フロー） */}
        <DebugPanel />
      </div>
    );
  }

  // 本番モード: 64×64 の透明ウィンドウのみ
  return (
    <div style={{ width: 64, height: 64, position: 'relative' }}>
      <DotCanvas cmd={cmd} />
      {status === 'CELEBRATING' && <LottieOverlay onComplete={handleCelebrateComplete} />}
    </div>
  );
}
