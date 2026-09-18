import type { BeepSound } from '@pos/shared';

/**
 * Scanner feedback.
 *
 * The beep is synthesised with the Web Audio API rather than shipped as an
 * audio file: there is nothing to download, nothing to cache, latency is
 * effectively zero, and the tone can be tuned per sound profile. A cashier
 * scanning hundreds of items an hour notices a 200ms delay - this has none.
 */

let context: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

/**
 * Browsers refuse to play audio until the user has interacted with the page.
 * Call this from the first tap/keypress so the very first scan already beeps.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume();
  unlocked = true;
}

interface ToneSpec {
  frequency: number;
  durationMs: number;
  type: OscillatorType;
  gain: number;
  /** Delay before this tone starts, for two-note chimes. */
  offsetMs?: number;
}

const PROFILES: Record<Exclude<BeepSound, 'silent'>, ToneSpec[]> = {
  // The flat, percussive supermarket beep.
  classic: [{ frequency: 2000, durationMs: 90, type: 'square', gain: 0.18 }],
  // A softer two-note rise, for quieter rooms.
  chime: [
    { frequency: 880, durationMs: 90, type: 'sine', gain: 0.25 },
    { frequency: 1320, durationMs: 130, type: 'sine', gain: 0.22, offsetMs: 80 },
  ],
};

function playTones(tones: ToneSpec[], volume: number): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  for (const tone of tones) {
    const start = ctx.currentTime + (tone.offsetMs ?? 0) / 1000;
    const end = start + tone.durationMs / 1000;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, start);

    // A short ramp instead of a hard stop - a square wave cut dead clicks.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain * volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

export interface BeepOptions {
  sound?: BeepSound;
  volume?: number;
}

/** The successful-scan beep. */
export function beep({ sound = 'classic', volume = 0.6 }: BeepOptions = {}): void {
  if (sound === 'silent') return;
  playTones(PROFILES[sound] ?? PROFILES.classic, volume);
}

/** Descending two-tone buzz: barcode not found, or an invalid action. */
export function errorBeep(volume = 0.6): void {
  playTones(
    [
      { frequency: 320, durationMs: 130, type: 'sawtooth', gain: 0.2 },
      { frequency: 220, durationMs: 200, type: 'sawtooth', gain: 0.2, offsetMs: 120 },
    ],
    volume,
  );
}

/** Rising three-note flourish: sale completed. */
export function successChime(volume = 0.6): void {
  playTones(
    [
      { frequency: 660, durationMs: 90, type: 'sine', gain: 0.2 },
      { frequency: 880, durationMs: 90, type: 'sine', gain: 0.2, offsetMs: 90 },
      { frequency: 1320, durationMs: 180, type: 'sine', gain: 0.18, offsetMs: 180 },
    ],
    volume,
  );
}

/** Insistent double beep: the kitchen has food ready for a table. */
export function alertChime(volume = 0.8): void {
  playTones(
    [
      { frequency: 1046, durationMs: 140, type: 'triangle', gain: 0.3 },
      { frequency: 1046, durationMs: 140, type: 'triangle', gain: 0.3, offsetMs: 220 },
    ],
    volume,
  );
}
