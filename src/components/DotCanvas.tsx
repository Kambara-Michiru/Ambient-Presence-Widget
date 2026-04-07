import { useEffect, useRef } from 'react';
import type { DrawCommand } from '../types/animation';

export function DotCanvas({ cmd }: { cmd: DrawCommand }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio ?? 1;
    const size = 64;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio ?? 1;
    const cssSize = canvas.width / dpr;

    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.save();

    const cx = cmd.x;
    const cy = cmd.y;

    ctx.translate(cx, cy);
    ctx.scale(cmd.scale, cmd.scale);
    ctx.translate(-cx, -cy);

    if (cmd.glowBlur > 0) {
      ctx.shadowBlur = cmd.glowBlur;
      ctx.shadowColor = cmd.glowColor;
    }

    const [h, s, l] = cmd.hsl;
    ctx.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${cmd.opacity})`;
    ctx.beginPath();
    ctx.arc(cmd.x, cmd.y, cmd.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [cmd]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />;
}
