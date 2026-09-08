/**
 * Web Audio API Multi-Band Equalizer & Frequency Splitter
 *
 * Splits the active audio stream into 3 dedicated frequency bands using BiquadFilterNodes:
 * 1. Bass: Sub/Kick (~20Hz - 250Hz)
 * 2. Vocals / Mids: Lead Vocals & Melody (~250Hz - 4kHz)
 * 3. Treble / Highs: Hi-hats & Crisp Details (~4kHz - 20kHz)
 */

export interface MultiBandLevels {
  bass: number; // 0.0 - 1.0 (Punchy, reactive on kicks & drops)
  vocal: number; // 0.0 - 1.0 (Smooth flowing melodic vocal wave)
  treble: number; // 0.0 - 1.0 (Fast micro-spikes on hi-hats/cymbals)
  leftBars: { bass: number; vocal: number; treble: number };
  rightBars: { bass: number; vocal: number; treble: number };
}

interface MultiBandEngine {
  ctx: AudioContext | null;
  bassAnalyser: AnalyserNode | null;
  vocalAnalyser: AnalyserNode | null;
  trebleAnalyser: AnalyserNode | null;
  masterAnalyser: AnalyserNode | null;
  bassData: Uint8Array | null;
  vocalData: Uint8Array | null;
  trebleData: Uint8Array | null;
  masterData: Uint8Array | null;
}

const engine: MultiBandEngine = {
  ctx: null,
  bassAnalyser: null,
  vocalAnalyser: null,
  trebleAnalyser: null,
  masterAnalyser: null,
  bassData: null,
  vocalData: null,
  trebleData: null,
  masterData: null,
};

let hasInitialized = false;

/**
 * Initializes and wires the 3 BiquadFilterNodes and AnalyserNodes
 * to the master media element audio source.
 */
export function registerMultiBandAudioSource(
  ctx: AudioContext,
  source: MediaElementAudioSourceNode,
) {
  if (hasInitialized && engine.ctx === ctx) return;

  try {
    // 1. Bass Biquad Filter (Lowpass 20Hz - 250Hz)
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.setValueAtTime(250, ctx.currentTime);
    bassFilter.Q.setValueAtTime(1.2, ctx.currentTime);

    const bassAnalyser = ctx.createAnalyser();
    bassAnalyser.fftSize = 64;
    bassAnalyser.smoothingTimeConstant = 0.65; // punchy & responsive

    // 2. Vocals / Mids Biquad Filter (Bandpass 250Hz - 4000Hz)
    const vocalFilter = ctx.createBiquadFilter();
    vocalFilter.type = "bandpass";
    vocalFilter.frequency.setValueAtTime(1600, ctx.currentTime);
    vocalFilter.Q.setValueAtTime(0.7, ctx.currentTime);

    const vocalAnalyser = ctx.createAnalyser();
    vocalAnalyser.fftSize = 64;
    vocalAnalyser.smoothingTimeConstant = 0.85; // smooth & flowing

    // 3. Treble / Highs Biquad Filter (Highpass 4000Hz - 20000Hz)
    const trebleFilter = ctx.createBiquadFilter();
    trebleFilter.type = "highpass";
    trebleFilter.frequency.setValueAtTime(4000, ctx.currentTime);
    trebleFilter.Q.setValueAtTime(1.0, ctx.currentTime);

    const trebleAnalyser = ctx.createAnalyser();
    trebleAnalyser.fftSize = 64;
    trebleAnalyser.smoothingTimeConstant = 0.5; // fast micro-spikes

    // 4. Master Spectrum Analyser
    const masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 128;
    masterAnalyser.smoothingTimeConstant = 0.75;

    // Connect filters to analysers only (not destination, zero audio coloring)
    source.connect(bassFilter);
    bassFilter.connect(bassAnalyser);

    source.connect(vocalFilter);
    vocalFilter.connect(vocalAnalyser);

    source.connect(trebleFilter);
    trebleFilter.connect(trebleAnalyser);

    source.connect(masterAnalyser);

    engine.ctx = ctx;
    engine.bassAnalyser = bassAnalyser;
    engine.vocalAnalyser = vocalAnalyser;
    engine.trebleAnalyser = trebleAnalyser;
    engine.masterAnalyser = masterAnalyser;
    engine.bassData = new Uint8Array(bassAnalyser.frequencyBinCount);
    engine.vocalData = new Uint8Array(vocalAnalyser.frequencyBinCount);
    engine.trebleData = new Uint8Array(trebleAnalyser.frequencyBinCount);
    engine.masterData = new Uint8Array(masterAnalyser.frequencyBinCount);

    hasInitialized = true;
  } catch (err) {
    console.warn("Multi-band equalizer filter setup skipped:", err);
  }
}

/**
 * Calculates average energy of frequency buffer
 */
function getEnergy(data: Uint8Array): number {
  if (!data || data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum / data.length / 255;
}

/**
 * Reads real-time multi-band levels from the Web Audio API nodes.
 * If audio is muted or silent, provides a procedural rhythm baseline.
 */
export function getLiveMultiBandLevels(
  isPlaying: boolean,
  timeMs: number = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now(),
): { bass: number; vocal: number; treble: number; isRealAudio: boolean } {
  let bass = 0;
  let vocal = 0;
  let treble = 0;
  let isRealAudio = false;

  try {
    if (
      engine.ctx &&
      engine.ctx.state === "running" &&
      engine.bassAnalyser &&
      engine.vocalAnalyser &&
      engine.trebleAnalyser &&
      engine.bassData &&
      engine.vocalData &&
      engine.trebleData
    ) {
      // Read raw Web Audio FFT byte frequencies
      engine.bassAnalyser.getByteFrequencyData(engine.bassData as any);
      engine.vocalAnalyser.getByteFrequencyData(engine.vocalData as any);
      engine.trebleAnalyser.getByteFrequencyData(engine.trebleData as any);

      const bassEnergy = getEnergy(engine.bassData);
      const vocalEnergy = getEnergy(engine.vocalData);
      const trebleEnergy = getEnergy(engine.trebleData);

      if (bassEnergy > 0.01 || vocalEnergy > 0.01 || trebleEnergy > 0.01) {
        // Dynamic non-linear power curve for punchy bass & crisp treble
        bass = Math.min(1.0, Math.pow(bassEnergy * 1.5, 1.25));
        vocal = Math.min(1.0, Math.pow(vocalEnergy * 1.35, 1.1));
        treble = Math.min(1.0, Math.pow(trebleEnergy * 1.7, 1.3));
        isRealAudio = true;
      }
    }
  } catch (err) {
    // Non-blocking Web Audio read failure
  }

  // Fallback intelligent simulation envelope if context is inactive or silent
  if (!isRealAudio && isPlaying) {
    const t = timeMs / 1000;
    // Bass: Heavy 4/4 kick pulse
    const kick = Math.pow(Math.abs(Math.sin(t * Math.PI * 2)), 6);
    bass = 0.25 + kick * 0.75;

    // Vocals: Smooth melodic sine envelope
    const melody = (Math.sin(t * 3.2) + Math.sin(t * 1.7) + 2) / 4;
    vocal = 0.2 + melody * 0.65;

    // Treble: 16th note fast micro-flutter
    const hiHat = Math.pow(Math.abs(Math.sin(t * Math.PI * 8 + 0.4)), 4);
    treble = 0.15 + hiHat * 0.7;
  } else if (!isRealAudio) {
    bass = 0.05;
    vocal = 0.05;
    treble = 0.05;
  }

  return { bass, vocal, treble, isRealAudio };
}

