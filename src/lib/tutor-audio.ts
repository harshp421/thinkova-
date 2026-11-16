"use client";

class TutorAudioEngine {
  private ctx: AudioContext | null = null;
  private oscNode: OscillatorNode | null = null;
  private lfoNode: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.6;
  private muted: boolean = false;
  private isAudioPlaying: boolean = false;

  private ensureContext() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume * 0.15, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public startAmbient() {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.isAudioPlaying) return;

    try {
      // Soft gentle tech pad synthesizer
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const padGain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(220, ctx.currentTime); // A3

      // LFO for gentle acoustic movement
      lfo.frequency.setValueAtTime(0.5, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(10, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // Low pass filter for soft classroom feel
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(450, ctx.currentTime);

      padGain.gain.setValueAtTime(0.01, ctx.currentTime);
      padGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.2);

      osc.connect(filter);
      filter.connect(padGain);
      padGain.connect(this.masterGain);

      osc.start();
      lfo.start();

      this.oscNode = osc;
      this.lfoNode = lfo;
      this.gainNode = padGain;
      this.isAudioPlaying = true;
    } catch {
      // Ignore if autoplay restricted
    }
  }

  public stopAmbient() {
    if (!this.isAudioPlaying || !this.ctx || !this.gainNode) return;
    try {
      this.gainNode.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.3);
      setTimeout(() => {
        try {
          this.oscNode?.stop();
          this.lfoNode?.stop();
          this.oscNode?.disconnect();
          this.lfoNode?.disconnect();
        } catch {
          // Already stopped
        }
        this.isAudioPlaying = false;
      }, 350);
    } catch {
      this.isAudioPlaying = false;
    }
  }

  public speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      if (this.muted) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      utterance.volume = this.muted ? 0 : this.volume;

      // Prefer a natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Zira"))
      ) || voices.find((v) => v.lang.startsWith("en"));
      if (preferred) {
        utterance.voice = preferred;
      }

      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore synthesis restrictions
    }
  }

  public stopSpeech() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  public setVolume(newVol: number) {
    this.volume = Math.max(0, Math.min(1, newVol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume * 0.15, this.ctx.currentTime);
    }
  }

  public getVolume() {
    return this.volume;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume * 0.15, this.ctx.currentTime);
    }
    if (this.muted) {
      this.stopSpeech();
    }
    return this.muted;
  }

  public isMute() {
    return this.muted;
  }
}

export const tutorAudio = new TutorAudioEngine();
