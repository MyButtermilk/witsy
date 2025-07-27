import { MicVAD } from '@ricky0123/vad-web';

export interface VadGateEvents {
  onSpeechStart?: () => void;
  onSpeechFrame?: (f32_16k: Float32Array) => void;
  onSpeechEnd?: (f32_16k_fullSegment: Float32Array) => void;
}

export interface VadGateOptions {
  preRollMs?: number;
  postRollMs?: number;
  minSpeechMs?: number;
  minSilenceMs?: number;
  vadAggressiveness?: 'low' | 'medium' | 'high';
}

/**
 * VadGate wraps the MicVAD WebAssembly VAD and exposes a simple event interface.
 * It converts floating point frames to events and handles pre/post roll settings.
 */
export class VadGate {
  private vad: any | null = null;
  private opts: Required<VadGateOptions>;
  private events: VadGateEvents;

  constructor(opts: VadGateOptions = {}, ev: VadGateEvents = {}) {
    const defaults: Required<VadGateOptions> = {
      preRollMs: 200,
      postRollMs: 250,
      minSpeechMs: 150,
      minSilenceMs: 800,
      vadAggressiveness: 'medium',
    };
    this.opts = { ...defaults, ...opts };
    this.events = ev;
  }

  /** Start listening to microphone and emit events when speech is detected. */
  async start(): Promise<void> {
    const { preRollMs, postRollMs, vadAggressiveness } = this.opts;
    const positive = vadAggressiveness === 'high' ? 0.9 : vadAggressiveness === 'low' ? 0.6 : 0.75;
    const negative = vadAggressiveness === 'high' ? 0.75 : vadAggressiveness === 'low' ? 0.3 : 0.5;
    const preFrames = Math.max(0, Math.floor(preRollMs / 100));
    const postFrames = Math.max(1, Math.floor(postRollMs / 100));
    this.vad = await MicVAD.new({
      positiveSpeechThreshold: positive,
      negativeSpeechThreshold: negative,
      preSpeechPadFrames: preFrames,
      redemptionFrames: postFrames,
      onSpeechStart: () => {
        if (this.events.onSpeechStart) this.events.onSpeechStart();
      },
      onSpeechEnd: (audio: Float32Array) => {
        if (this.events.onSpeechEnd) this.events.onSpeechEnd(audio);
      },
      onFrameProcessed: (frame: Float32Array, isSpeech: boolean) => {
        if (isSpeech && this.events.onSpeechFrame) this.events.onSpeechFrame(frame);
      },
    });
    await this.vad.start();
  }

  async pause(): Promise<void> {
    if (this.vad) {
      await this.vad.pause();
    }
  }

  async stop(): Promise<void> {
    if (this.vad) {
      await this.vad.stop();
      this.vad = null;
    }
  }
}

/**
 * Convert a Float32Array with normalized [-1,1] samples into an Int16Array for PCM 16‑bit audio.
 */
export function float32ToInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    let n = f32[i];
    n = Math.max(-1, Math.min(1, n));
    out[i] = n < 0 ? n * 32768 : n * 32767;
  }
  return out;
}
