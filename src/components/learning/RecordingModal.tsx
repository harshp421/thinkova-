"use client";

import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, X, Volume2, VolumeX, RotateCcw, Maximize2 } from "lucide-react";
import { LiveClassSession } from "@/data/live-classes";
import { tutorAudio } from "@/lib/tutor-audio";

export interface RecordingModalProps {
  recording: LiveClassSession | null;
  onClose: () => void;
}

export function RecordingModal({ recording, onClose }: RecordingModalProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const totalDurationSec = 45 * 60; // 45 min
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Audio synchronization
  useEffect(() => {
    if (!recording) return;

    if (isPlaying) {
      tutorAudio.startAmbient();
      tutorAudio.speak(
        `Welcome to the class recording for Level ${recording.levelNumber}: ${recording.title}. In this live laboratory session, tutor ${recording.tutorName} reviews ${recording.topicDescription}.`
      );
    } else {
      tutorAudio.stopAmbient();
      tutorAudio.stopSpeech();
    }

    return () => {
      tutorAudio.stopAmbient();
      tutorAudio.stopSpeech();
    };
  }, [isPlaying, recording]);

  // Cleanup on close
  const handleClose = () => {
    tutorAudio.stopAmbient();
    tutorAudio.stopSpeech();
    onClose();
  };

  // Timeline progression
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTimeSec((prev) => (prev >= totalDurationSec ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, totalDurationSec]);

  // Video Canvas Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !recording) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.05;
      const w = canvas.width;
      const h = canvas.height;

      // Studio backdrop
      ctx.fillStyle = "#0D0F14";
      ctx.fillRect(0, 0, w, h);

      // Terminal / Lab Screen Share
      ctx.fillStyle = "#151821";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(24, 24, w - 48, h - 90, 16);
      ctx.fill();
      ctx.stroke();

      // Top IDE Bar
      ctx.fillStyle = "#1A1D27";
      ctx.beginPath();
      ctx.roundRect(24, 24, w - 48, 32, [16, 16, 0, 0]);
      ctx.fill();

      // Window controls
      ctx.fillStyle = "#FF5F56";
      ctx.beginPath();
      ctx.arc(42, 40, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFBD2E";
      ctx.beginPath();
      ctx.arc(58, 40, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#27C93F";
      ctx.beginPath();
      ctx.arc(74, 40, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.fillText(`thinkova_lab_level_${recording.levelNumber}.py — Screen share by ${recording.tutorName}`, 96, 44);

      // Code simulation
      ctx.font = "12px monospace";
      ctx.fillStyle = "#FF6B2C";
      ctx.fillText("import thinkova_rover as rover", 44, 82);
      ctx.fillStyle = "#4EC9B0";
      ctx.fillText("from vision import UltrasonicSensor, MotorController", 44, 104);
      ctx.fillStyle = "#CE9178";
      ctx.fillText("# Level " + recording.levelNumber + ": " + recording.title, 44, 130);
      ctx.fillStyle = "#9CDCFE";
      ctx.fillText("def on_obstacle_detected(distance_cm):", 44, 156);
      ctx.fillStyle = "#DCDCAA";
      ctx.fillText("    if distance_cm < 20:", 44, 178);
      ctx.fillStyle = "#CE9178";
      ctx.fillText('        print("Safety boundary triggered! Halting rover...")', 44, 200);
      ctx.fillStyle = "#C586C0";
      ctx.fillText("        rover.brake()", 44, 222);

      // Tutor PIP Camera
      const pipW = 160;
      const pipH = 100;
      const pipX = w - pipW - 44;
      const pipY = 70;

      ctx.fillStyle = "#0B0C0F";
      ctx.strokeStyle = "#FF6B2C";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(pipX, pipY, pipW, pipH, 12);
      ctx.fill();
      ctx.stroke();

      // Tutor avatar circle
      ctx.fillStyle = "#2D313D";
      ctx.beginPath();
      ctx.arc(pipX + pipW / 2, pipY + 40, 24, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(recording.tutorName.slice(0, 2).toUpperCase(), pipX + pipW / 2, pipY + 45);
      ctx.textAlign = "left";

      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(recording.tutorName, pipX + 16, pipY + 80);

      ctx.fillStyle = isPlaying && !isMuted ? "#1F9D55" : "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(pipX + pipW - 18, pipY + 77, 4, 0, Math.PI * 2);
      ctx.fill();

      // Audio waveform
      if (isPlaying && !isMuted) {
        ctx.strokeStyle = "#FF6B2C";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < 40; x += 4) {
          const yh = Math.sin(t * 4 + x) * 6;
          ctx.moveTo(pipX + 16 + x, pipY + 92 - yh);
          ctx.lineTo(pipX + 16 + x, pipY + 92 + yh);
        }
        ctx.stroke();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isMuted, recording]);

  if (!recording) return null;

  const formatMinSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in select-none">
      <div
        ref={containerRef}
        className="w-full max-w-[760px] rounded-[28px] bg-[#0B0C0F] text-white p-6 shadow-2xl border border-white/10 space-y-4"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#FF6B2C]/20 text-[#FF6B2C] text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5">
                Class Recording · Level {recording.levelNumber}
              </span>
              <span className="text-[11px] text-white/50">{recording.recordingDuration}</span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1">
              {recording.title}
            </h3>
            <p className="text-xs text-white/60">
              {recording.dateDisplay} · Tutor: {recording.tutorName}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="size-8 rounded-full flex items-center justify-center hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Video Playback Stage */}
        <div className="relative aspect-video w-full rounded-2xl bg-[#14161D] border border-white/10 overflow-hidden flex flex-col justify-between p-4">
          <canvas
            ref={canvasRef}
            width={800}
            height={450}
            onClick={() => setIsPlaying(!isPlaying)}
            className="absolute inset-0 w-full h-full object-cover cursor-pointer"
            title="Click to Play/Pause"
          />

          <div className="relative z-10 flex items-center justify-between">
            <span className="rounded-full bg-black/70 border border-white/10 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
              Replay: Level {recording.levelNumber}
            </span>
            <span className="text-[11px] font-mono bg-black/70 border border-white/10 px-2.5 py-1 rounded-full text-white/80 backdrop-blur-md">
              {formatMinSec(currentTimeSec)} / 45:00
            </span>
          </div>

          {/* Bottom Player Controls */}
          <div className="relative z-10 space-y-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 -mx-4 -mb-4 rounded-b-2xl">
            {/* Scrubber bar */}
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                setCurrentTimeSec(Math.round(pos * totalDurationSec));
              }}
              className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden cursor-pointer relative hover:h-2 transition-all"
            >
              <div
                className="h-full bg-[#FF6B2C] rounded-full transition-all duration-300"
                style={{
                  width: `${(currentTimeSec / totalDurationSec) * 100}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1 hover:text-[#FF6B2C] transition cursor-pointer"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTimeSec((prev) => Math.max(0, prev - 10))}
                  className="p-1 text-[11px] font-mono hover:text-[#FF6B2C] transition cursor-pointer"
                  title="Rewind 10s"
                >
                  ↺ 10
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTimeSec((prev) => Math.min(totalDurationSec, prev + 10))}
                  className="p-1 text-[11px] font-mono hover:text-[#FF6B2C] transition cursor-pointer"
                  title="Forward 10s"
                >
                  ↻ 10
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1.5 ml-1">
                  <button
                    type="button"
                    onClick={() => {
                      const m = tutorAudio.toggleMute();
                      setIsMuted(m);
                    }}
                    className="p-1 hover:text-[#FF6B2C] transition cursor-pointer"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <VolumeX className="size-4 text-red-400" />
                    ) : (
                      <Volume2 className="size-4 text-white" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setVolume(v);
                      tutorAudio.setVolume(v);
                      if (isMuted && v > 0) {
                        setIsMuted(false);
                        tutorAudio.toggleMute();
                      }
                    }}
                    className="w-14 h-1 accent-[#FF6B2C] bg-white/20 rounded-full cursor-pointer hidden sm:block"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!containerRef.current) return;
                    if (document.fullscreenElement) {
                      document.exitFullscreen();
                    } else {
                      containerRef.current.requestFullscreen();
                    }
                  }}
                  className="p-1 hover:text-white transition cursor-pointer"
                  title="Fullscreen"
                >
                  <Maximize2 className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Notes */}
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-white/60">
            Topic Focus: {recording.topicDescription}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full bg-white/10 hover:bg-white/15 px-4 py-2 font-semibold text-white transition cursor-pointer"
          >
            Close replay
          </button>
        </div>
      </div>
    </div>
  );
}
