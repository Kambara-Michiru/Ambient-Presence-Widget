import { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import celebrateJson from '../assets/celebrate.json';

export function LottieOverlay({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anim = lottie.loadAnimation({
      container: containerRef.current!,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: celebrateJson,
    });
    anim.addEventListener('complete', onComplete);
    return () => anim.destroy();
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 0, left: 0, width: 64, height: 64, pointerEvents: 'none' }}
    />
  );
}
