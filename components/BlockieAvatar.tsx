"use client";

import { useEffect, useRef } from "react";
import blockies from "blockies";

interface BlockieAvatarProps {
  address: string;
  size?: number;
  className?: string;
}

export function BlockieAvatar({
  address,
  size = 24,
  className = "",
}: BlockieAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !address) return;

    try {
      const rendered = blockies({
        seed: address.toLowerCase(),
        size: 8,
        scale: Math.max(4, Math.ceil(size / 8)),
      });
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(rendered, 0, 0);
      }
    } catch {
      // Ignore canvas rendering failures in headless environments
    }
  }, [address, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={`rounded-full object-cover ${className}`}
      aria-hidden="true"
    />
  );
}
