/**
 * Procedural Web Audio API Sound Synthesizer
 * Synthesizes retro-arcade sound effects and background loops dynamically.
 */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmInterval = null;
    this.volume = 0.5; // Default volume (0.0 to 1.0)
    this.musicEnabled = true;
    
    // BGM state variables
    this.bgmStep = 0;
    this.bgmTempo = 125; // BPM
    
    // Noise buffer cache (reused for splats and explosions)
    this.noiseBuffer = null;
  }

  /**
   * Initializes the audio context on user interaction.
   * Browsers block audio until a click or keypress occurs.
   */
  async init() {
    if (this.ctx) return;
    
    // Create AudioContext with fallback support
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Create master gain node
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
    
    // Generate white noise buffer
    this.createNoiseBuffer();
    
    // Start background music loop if enabled
    if (this.musicEnabled) {
      this.startBGM();
    }
  }

  /**
   * Resumes AudioContext if suspended (browser autoplay safety)
   */
  async resume() {
    if (!this.ctx) {
      await this.init();
    } else if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Sets master volume level
   * @param {number} level - Volume scale from 0.0 to 1.0
   */
  setVolume(level) {
    this.volume = Math.max(0, Math.min(1, level));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Toggles synthesized background music loop
   * @param {boolean} enabled - True to enable music
   */
  setMusicEnabled(enabled) {
    this.musicEnabled = enabled;
    if (enabled) {
      this.startBGM();
    } else {
      this.stopBGM();
    }
  }

  /**
   * Generates a 2-second buffer of white noise for explosions and splats
   */
  createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  /**
   * Plays a quick swoosh sound for hand/mouse swipes
   */
  playSwipe() {
    if (!this.ctx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'triangle';
    
    // Sweep pitch down quickly: 650Hz down to 180Hz
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);

    // Fast envelope fadeout
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.4, t + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  /**
   * Plays a squishy splat sound when a fruit is sliced
   */
  playSplat() {
    if (!this.ctx || !this.noiseBuffer) return;
    this.resume();

    const t = this.ctx.currentTime;

    // 1. Synthesize juicy pop (low frequency sweep)
    const popOsc = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(160, t);
    popOsc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

    popGain.gain.setValueAtTime(0.6, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    popOsc.connect(popGain);
    popGain.connect(this.masterGain);
    popOsc.start(t);
    popOsc.stop(t + 0.12);

    // 2. Synthesize high frequency squirt (noise passband)
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(8, t);
    filter.frequency.setValueAtTime(1100, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.18);

    const squishGain = this.ctx.createGain();
    squishGain.gain.setValueAtTime(0, t);
    squishGain.gain.linearRampToValueAtTime(0.5, t + 0.01);
    squishGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    noiseNode.connect(filter);
    filter.connect(squishGain);
    squishGain.connect(this.masterGain);

    noiseNode.start(t);
    noiseNode.stop(t + 0.22);
  }

  /**
   * Plays a loud bass explosion with noise and distortion when a bomb is sliced
   */
  playExplosion() {
    if (!this.ctx || !this.noiseBuffer) return;
    this.resume();

    const t = this.ctx.currentTime;

    // 1. Deep rumble sweep
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(260, t);
    boomOsc.frequency.linearRampToValueAtTime(20, t + 1.2);

    boomGain.gain.setValueAtTime(1.0, t);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    boomOsc.connect(boomGain);
    boomGain.connect(this.masterGain);
    boomOsc.start(t);
    boomOsc.stop(t + 1.6);

    // 2. Shockwave crackle (Lowpass filtered noise with overdrive)
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(30, t + 1.0);

    // Wave Shaper node for distortion
    const dist = this.ctx.createWaveShaper();
    dist.curve = this.makeDistortionCurve(50);
    dist.oversample = '4x';

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.8, t + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    noiseNode.connect(filter);
    filter.connect(dist);
    dist.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noiseNode.start(t);
    noiseNode.stop(t + 1.3);
  }

  /**
   * Helper to create distortion curve for the wave shaper
   */
  makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  /**
   * Plays a sparkling ascending arpeggio on combo
   * @param {number} comboSize - Number of items sliced (e.g. 3, 4, 5)
   */
  playCombo(comboSize) {
    if (!this.ctx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const notes = [
      261.63, // C4
      293.66, // D4
      329.63, // E4
      349.23, // F4
      392.00, // G4
      440.00, // A4
      493.88, // B4
      523.25, // C5
      587.33, // D5
      659.25, // E5
      698.46, // F5
      783.99  // G5
    ];

    // Pick scale notes: C Major pentatonic
    const pentatonic = [0, 2, 4, 7, 9, 11, 12, 14, 16, 19, 21, 23].map(idx => {
      // Scale frequency up or down
      return 261.63 * Math.pow(2, idx / 12);
    });

    const size = Math.min(comboSize, 6);
    const baseIndex = Math.min(2, Math.floor(Math.random() * 4));

    for (let i = 0; i < size; i++) {
      const delay = i * 0.08;
      const noteFreq = pentatonic[baseIndex + i];

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(noteFreq, t + delay);
      
      // Pitch slide slightly up
      osc.frequency.exponentialRampToValueAtTime(noteFreq * 1.05, t + delay + 0.15);

      gainNode.gain.setValueAtTime(0, t + delay);
      gainNode.gain.linearRampToValueAtTime(0.2, t + delay + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.18);

      osc.connect(gainNode);
      gainNode.connect(this.masterGain);

      osc.start(t + delay);
      osc.stop(t + delay + 0.2);
    }
  }

  /**
   * Plays a sad, minor descending tone cluster on game over
   */
  playGameOver() {
    if (!this.ctx) return;
    this.resume();

    const t = this.ctx.currentTime;
    
    // Descending dissonant notes
    const rootNotes = [220, 207.65, 196, 174.61]; // A3, G#3, G3, F3
    
    rootNotes.forEach((rootFreq, idx) => {
      const startDelay = idx * 0.25;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(rootFreq, t + startDelay);
      osc1.frequency.linearRampToValueAtTime(rootFreq * 0.85, t + startDelay + 0.6);

      osc2.frequency.setValueAtTime(rootFreq * 1.5, t + startDelay); // Perfect fifth harmony

      // Sad vibrato
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 6; // 6Hz modulation
      lfoGain.gain.value = 8;
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      gainNode.gain.setValueAtTime(0, t + startDelay);
      gainNode.gain.linearRampToValueAtTime(0.15, t + startDelay + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + startDelay + 0.8);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.masterGain);

      lfo.start(t + startDelay);
      osc1.start(t + startDelay);
      osc2.start(t + startDelay);

      lfo.stop(t + startDelay + 0.9);
      osc1.stop(t + startDelay + 0.9);
      osc2.stop(t + startDelay + 0.9);
    });
  }

  /**
   * Starts the procedural synth BGM sequencer
   */
  startBGM() {
    this.stopBGM();
    if (!this.musicEnabled) return;
    
    const stepDuration = 60 / this.bgmTempo / 2; // Eighth notes
    let nextNoteTime = 0;

    // Use a robust look-ahead scheduling mechanism
    this.bgmInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state === 'suspended') return;

      const currentTime = this.ctx.currentTime;
      if (nextNoteTime === 0) {
        nextNoteTime = currentTime + 0.05;
      }

      // Schedule notes that fall within the next 200ms
      while (nextNoteTime < currentTime + 0.2) {
        this.scheduleBGMStep(this.bgmStep, nextNoteTime);
        nextNoteTime += stepDuration;
        this.bgmStep = (this.bgmStep + 1) % 32; // 32-step sequencer loop
      }
    }, 100);
  }

  /**
   * Stops the background music
   */
  stopBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  /**
   * Schedules a single synthesizer event in the BGM loop
   * @param {number} step - Current sequencer index (0-31)
   * @param {number} time - AudioContext timeline target execution timestamp
   */
  scheduleBGMStep(step, time) {
    if (!this.ctx || !this.musicEnabled) return;

    // 1. Synthesize Bassline (16-step repeating progression)
    // Progression: A min (8 steps) -> F maj (8 steps) -> C maj (8 steps) -> G maj (8 steps)
    const chordIdx = Math.floor(step / 8);
    const bassRoots = [110.00, 87.31, 130.81, 98.00]; // A2, F2, C3, G2
    const currentRoot = bassRoots[chordIdx];
    
    // Play bass notes on beats (every even eighth note)
    const isBassBeat = (step % 2 === 0);
    if (isBassBeat) {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'triangle';
      
      // Simple syncopation: octave jump on step 4 of each chord
      const octaveMultiplier = ((step % 8) === 4) ? 2 : 1;
      osc.frequency.setValueAtTime(currentRoot * octaveMultiplier, time);
      
      // Quick volume envelope
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.18, time + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

      osc.connect(gainNode);
      gainNode.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + 0.22);
    }

    // 2. Synthesize Cyber Arpeggio (melodic treble overlay)
    // Notes of current chord
    // A minor: [A4, C5, E5, A5]
    // F Major: [F4, A4, C5, F5]
    // C Major: [C4, E4, G4, C5]
    // G Major: [G4, B4, D5, G5]
    const chordNotes = [
      [220.00, 261.63, 329.63, 440.00], // Amin
      [174.61, 220.00, 261.63, 349.23], // Fmaj
      [261.63, 329.63, 392.00, 523.25], // Cmaj
      [196.00, 246.94, 293.66, 392.00]  // Gmaj
    ];

    const currentChord = chordNotes[chordIdx];
    
    // Arpeggiate sequence: select note based on current step
    // Only play on steps that are not empty (e.g. 0, 1, 3, 4, 6, 7) for rhythmic feel
    const rhythmPattern = [1, 0, 1, 1, 0, 1, 1, 0];
    const subStep = step % 8;
    
    if (rhythmPattern[subStep] === 1) {
      const noteOffset = [0, 1, 2, 3, 2, 1, 3, 0][subStep];
      let noteFreq = currentChord[noteOffset];

      // Add octave jumps for variety on second bar of each chord
      if (step >= 8 && step < 16) noteFreq *= 2;
      
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'sine'; // Soft retro-sine arpeggio
      osc.frequency.setValueAtTime(noteFreq, time);

      // Sparkle fadeout envelope
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.04, time + 0.005);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.connect(gainNode);
      gainNode.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + 0.16);
    }
  }
}

// Export single instance
export const audio = new AudioManager();
export default audio;
