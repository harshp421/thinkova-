"use client";

import React, { useEffect, useRef, useState } from "react";

interface LoadingSessionOverlayProps {
  isOpen: boolean;
  message?: string;
  subMessage?: string;
}

export function LoadingSessionOverlay({ isOpen }: LoadingSessionOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawnCanvas, setHasDrawnCanvas] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setHasDrawnCanvas(false);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let isRunning = true;
    let animId: number;
    let vfcHandle: number;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const startPlay = () => {
      video.play().catch(() => {});
    };

    video.addEventListener("loadedmetadata", startPlay);
    video.addEventListener("canplay", startPlay);
    startPlay();

    const processFrame = () => {
      if (!isRunning) return;
      if (video.readyState >= 2 && ctx) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(video, 0, 0, w, h);

        try {
          const frame = ctx.getImageData(0, 0, w, h);
          // High performance 32-bit integer array processing (under 0.05ms)
          const buf32 = new Uint32Array(frame.data.buffer);
          const len = buf32.length;
          for (let i = 0; i < len; i++) {
            const pixel = buf32[i]!;
            const r = pixel & 0xff;
            const g = (pixel >> 8) & 0xff;
            const b = (pixel >> 16) & 0xff;
            if (r > 235 && g > 235 && b > 235) {
              buf32[i] = 0; // Alpha 0
            }
          }
          ctx.putImageData(frame, 0, 0);
          setHasDrawnCanvas(true);
        } catch {
          // Safe fallback
        }
      }

      // Use native video frame callback when supported for zero unnecessary CPU wakes
      if ("requestVideoFrameCallback" in video) {
        vfcHandle = (video as unknown as { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(processFrame);
      } else {
        animId = requestAnimationFrame(processFrame);
      }
    };

    if ("requestVideoFrameCallback" in video) {
      vfcHandle = (video as unknown as { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(processFrame);
    } else {
      animId = requestAnimationFrame(processFrame);
    }

    return () => {
      isRunning = false;
      video.removeEventListener("loadedmetadata", startPlay);
      video.removeEventListener("canplay", startPlay);
      if (animId) cancelAnimationFrame(animId);
      if (vfcHandle && "cancelVideoFrameCallback" in video) {
        (video as unknown as { cancelVideoFrameCallback: (id: number) => void }).cancelVideoFrameCallback(vfcHandle);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0B0C0F]/50 backdrop-blur-[2.5px] transition-all duration-200"
    >
      {/* Hidden processing video */}
      <video
        ref={videoRef}
        src="/images/loading.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{
          position: "fixed",
          top: "-9999px",
          left: "-9999px",
          width: "120px",
          height: "120px",
          opacity: 0.001,
          pointerEvents: "none",
        }}
      />

      {/* Floating hourglass animation - NO card, NO text/content below */}
      <div className="relative flex items-center justify-center select-none">
        {/* Chroma-keyed Canvas (displays transparent floating hourglass video animation) */}
        <canvas
          ref={canvasRef}
          width={120}
          height={120}
          className={`size-28 sm:size-32 object-contain brightness-100 drop-shadow-xl ${
            hasDrawnCanvas ? "block" : "hidden"
          }`}
        />

        {/* Immediate direct video fallback while canvas initializes */}
        {!hasDrawnCanvas && (
          <video
            src="/images/loading.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="size-28 sm:size-32 object-contain rounded-2xl brightness-100 drop-shadow-xl block"
          />
        )}
      </div>
    </div>
  );
}
