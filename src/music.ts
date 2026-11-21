// Music: four short chiptune pieces written here as notes, rendered once into looping buffers when first needed. The
// title theme plays on the title and pit boards; each league has its own race theme, from GO to the finish line.
import Phaser from 'phaser';

/**
 * A piece: one chord per bar (root and quality, e.g. 'Am', 'F#', 'Bb'), the lead as notes and lengths in sixteenths
 * per bar ('E5:4', a rest is 'r:4', each bar sums to 16), and the backing styles. It plays twice through, the second
 * time with busier hats and the arpeggio an octave up, so the loop is twice the chords long.
 */
interface Song {
  bpm: number;
  chords: string[];
  lead: string[];
  /** Lead voice: a 25 % pulse, or a softer triangle. */
  leadWave: 'pulse' | 'triangle';
  bass: 'octaves' | 'roots' | 'tresillo';
  /** One bar of drums: 16 steps each, x for a hit. */
  kick: string;
  snare: string;
  hat: string;
}

export const SONGS = {
  /** "Skyline": unhurried, A minor. */
  title: {
    bpm: 108, leadWave: 'triangle', bass: 'roots',
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'],
    lead: [
      'A4:3 C5:3 E5:2 D5:4 C5:4', 'A4:6 G4:2 A4:4 C5:4', 'G4:3 C5:3 E5:2 G5:4 E5:4', 'D5:12 r:4',
      'A4:3 C5:3 E5:2 A5:4 G5:2 E5:2', 'F5:6 E5:2 C5:4 A4:4', 'B4:4 D5:4 G5:4 F5:2 D5:2', 'E5:8 G#4:4 B4:4',
    ],
    kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
  },
  /** Neon, "Rooftop Rush": bright and driving, E minor. */
  neon: {
    bpm: 150, leadWave: 'pulse', bass: 'octaves',
    chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'B'],
    lead: [
      'E5:2 E5:2 G5:2 E5:2 B5:4 A5:2 G5:2', 'E5:2 G5:2 C6:4 B5:2 A5:2 G5:4', 'D5:2 G5:2 B5:2 G5:2 D6:4 B5:4', 'A5:6 F#5:2 D5:4 A5:4',
      'E5:2 E5:2 G5:2 E5:2 B5:4 D6:4', 'C6:4 B5:2 A5:2 G5:4 E5:4', 'F#5:4 A5:4 D6:4 C6:2 A5:2', 'B5:8 D#5:4 F#5:4',
    ],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
  },
  /** Storm, "Thunderline": syncopated, D minor. */
  storm: {
    bpm: 140, leadWave: 'pulse', bass: 'tresillo',
    chords: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'C', 'A'],
    lead: [
      'D5:3 F5:3 A5:4 G5:2 F5:2 E5:2', 'D5:6 r:2 Bb4:2 D5:2 F5:4', 'C5:3 F5:3 A5:4 C6:4 A5:2', 'G5:10 E5:2 C5:4',
      'D5:3 F5:3 A5:4 D6:4 C6:2', 'Bb5:6 A5:2 F5:4 D5:4', 'E5:4 G5:4 C6:3 Bb5:3 G5:2', 'A5:8 C#5:4 E5:4',
    ],
    kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
  },
  /** Blackout, "Lights Out": fast and tense, C harmonic minor. */
  blackout: {
    bpm: 160, leadWave: 'pulse', bass: 'octaves',
    chords: ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Bb', 'G'],
    lead: [
      'C5:2 r:2 C5:2 Eb5:2 G5:4 F5:2 Eb5:2', 'C5:2 r:2 Ab4:2 C5:2 Eb5:6 r:2', 'F5:2 r:2 F5:2 Ab5:2 C6:4 Bb5:2 Ab5:2', 'G5:6 F5:2 D5:4 B4:4',
      'C5:2 r:2 C5:2 Eb5:2 G5:4 C6:4', 'Ab5:4 G5:2 F5:2 Eb5:4 C5:4', 'D5:4 F5:4 Bb5:4 Ab5:2 F5:2', 'G5:8 B4:4 D5:4',
    ],
    kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
  },
} satisfies Record<string, Song>;

export type SongName = keyof typeof SONGS;
/** The race theme for each league, by index. */
export const LEAGUE_SONGS: readonly SongName[] = ['neon', 'storm', 'blackout'];
/** Music sits under the sound effects. */
const VOLUME = 0.32;

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C#4' → MIDI note number. */
function midi(name: string) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}
const hz = (n: number) => 440 * 2 ** ((n - 69) / 12);
/** 'F#m' → its triad as pitch classes above the root, and the root's pitch class. */
function chord(c: string) {
  const m = /^([A-G][#b]?)(m?)$/.exec(c);
  if (!m) throw new Error(`bad chord ${c}`);
  const root = ((midi(`${m[1]}0`) % 12) + 12) % 12;
  return { root, tones: [0, m[2] ? 3 : 4, 7] };
}

type Wave = 'pulse' | 'square' | 'thin' | 'triangle';

/**
 * Mixes one note into `out` from sample `at`, wrapping round the end so releases and echoes carry over the loop's
 * seam. A short attack and release keep the edges from clicking; `smooth` low-passes it (lower is duller).
 */
function note(out: Float32Array, rate: number, at: number, secs: number, freq: number, wave: Wave, vol: number, smooth = 1, vibrato = 0) {
  const len = out.length, n = Math.floor(secs * rate), rel = Math.floor(0.03 * rate), atk = Math.floor(0.004 * rate);
  const duty = wave === 'pulse' ? 0.25 : wave === 'thin' ? 0.125 : 0.5, tri = wave === 'triangle';
  const inc = freq / rate, fall = Math.exp(-1 / (0.08 * rate)), vibFrom = Math.floor(0.12 * rate), vibW = (2 * Math.PI * 5.5) / rate;
  let phase = 0, lp = 0, decay = 1;
  for (let i = 0, j = at % len; i < n + rel; i++, j = j + 1 === len ? 0 : j + 1) {
    phase += vibrato && i > vibFrom ? inc * (1 + vibrato * Math.sin(vibW * i)) : inc;
    if (phase >= 1) phase -= 1;
    const s = tri ? 1 - 4 * Math.abs(phase - 0.5) : phase < duty ? 1 : -1;
    lp += (s - lp) * smooth;
    // Attack, a slight fall to a sustain level, then the release after the note's length.
    let env: number;
    if (i < atk) env = i / atk;
    else if (i < n) { env = 0.75 + 0.25 * decay; decay *= fall; }
    else env = 0.75 * (1 - (i - n) / rel);
    out[j] += lp * env * vol;
  }
}

/** Kick, snare and hats: a falling sine, a burst of noise over a low tone, and a short hiss. */
function drum(out: Float32Array, rate: number, at: number, kind: 'kick' | 'snare' | 'hat' | 'open', rnd: () => number) {
  const len = out.length;
  const secs = { kick: 0.16, snare: 0.14, hat: 0.03, open: 0.12 }[kind], n = Math.floor(secs * rate);
  let phase = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate, env = (1 - i / n) ** 2;
    let s = 0;
    if (kind === 'kick') {
      phase += (50 + 110 * Math.exp(-t * 30)) / rate;
      s = Math.sin(2 * Math.PI * phase) * 0.55;
    } else if (kind === 'snare') {
      phase += 190 / rate;
      s = (rnd() * 2 - 1) * 0.22 + (1 - 4 * Math.abs((phase % 1) - 0.5)) * 0.12 * Math.exp(-t * 30);
    } else {
      // A difference of successive noise samples: the hiss with the low end taken out.
      const w = rnd() * 2 - 1;
      s = (w - prev) * 0.05;
      prev = w;
    }
    out[(at + i) % len] += s * env;
  }
}

/** Renders a piece into a mono buffer that loops cleanly: two passes through its chords. */
export function renderSong(ctx: BaseAudioContext, song: Song): AudioBuffer {
  const rate = ctx.sampleRate, step = 60 / song.bpm / 4, bars = song.chords.length * 2;
  const total = Math.round(bars * 16 * step * rate);
  const buffer = ctx.createBuffer(1, total, rate), out = buffer.getChannelData(0);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const at = (bar: number, s: number) => Math.round((bar * 16 + s) * step * rate);

  for (let bar = 0; bar < bars; bar++) {
    const second = bar >= song.chords.length, b = bar % song.chords.length, last = b === song.chords.length - 1;
    const { root, tones } = chord(song.chords[b]);
    // Bass: the root kept between E2 and D#3, so it carries on small speakers.
    const bass = 40 + ((root - 4 + 12) % 12);
    const bassAt = (s: number, n: number, len = 1.6) => note(out, rate, at(bar, s), step * len, hz(n), 'square', 0.13, 0.22);
    if (song.bass === 'octaves') for (let s = 0; s < 16; s += 2) bassAt(s, bass + (s % 4 === 2 ? 12 : 0));
    else if (song.bass === 'roots') for (let s = 0; s < 16; s += 2) bassAt(s, bass, 1.8);
    else for (const s of [0, 3, 6, 8, 11, 14]) bassAt(s, bass + (s === 6 || s === 14 ? 12 : 0), 2.4);

    // Arpeggio: up through the chord to the octave and back, a sixteenth a note; an octave higher on the second pass.
    const arpBase = 60 + root + (second ? 12 : 0), [r0, r3, r5] = tones, arp = [r0, r3, r5, 12, r5, r3, r0, r3];
    for (let s = 0; s < 16; s++) note(out, rate, at(bar, s), step * 0.7, hz(arpBase + arp[s % 8]), 'thin', 0.035, 0.5);

    // Lead, with a quiet echo three sixteenths behind.
    let s = 0;
    for (const tok of song.lead[b].split(' ')) {
      const [name, l] = tok.split(':'), steps = Number(l);
      if (name !== 'r') {
        const f = hz(midi(name)), wave: Wave = song.leadWave === 'triangle' ? 'triangle' : 'pulse';
        note(out, rate, at(bar, s), step * steps * 0.92, f, wave, wave === 'triangle' ? 0.16 : 0.085, 0.6, 0.004);
        note(out, rate, at(bar, s + 3), step * steps * 0.8, f, wave, wave === 'triangle' ? 0.05 : 0.028, 0.4, 0.004);
      }
      s += steps;
    }

    // Drums, with a snare fill into the top of each pass.
    for (let k = 0; k < 16; k++) {
      if (song.kick[k] === 'x') drum(out, rate, at(bar, k), 'kick', rnd);
      const fill = last && k >= 12;
      if (song.snare[k] === 'x' || (fill && k !== 13)) drum(out, rate, at(bar, k), 'snare', rnd);
      if (song.hat[k] === 'x' || (second && k % 2 === 1)) drum(out, rate, at(bar, k), second && k % 4 === 2 ? 'open' : 'hat', rnd);
    }
  }
  // Leave headroom: scale the loudest moment to 0.9.
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < total; i++) out[i] *= 0.9 / peak;
  return buffer;
}

let current: { name: SongName; sound: Phaser.Sound.WebAudioSound } | null = null;

/** Renders a piece into the audio cache if it isn't there yet (a fraction of a second), so starting it later is instant. */
export function prepareMusic(scene: Phaser.Scene, name: SongName) {
  const key = `music-${name}`, sm = scene.sound;
  if (sm instanceof Phaser.Sound.WebAudioSoundManager && !scene.cache.audio.exists(key)) scene.cache.audio.add(key, renderSong(sm.context, SONGS[name]));
  return key;
}

/**
 * Plays a piece on a loop. If it's already playing, it carries on (title to pit board and back); anything else
 * playing stops. The sound manager's mute covers it. Without Web Audio there is no music.
 */
export function playMusic(scene: Phaser.Scene, name: SongName) {
  const sm = scene.sound;
  if (!(sm instanceof Phaser.Sound.WebAudioSoundManager)) return;
  if (current?.name === name && current.sound.isPlaying) return;
  stopMusic();
  const key = prepareMusic(scene, name);
  const sound = sm.add(key, { loop: true, volume: VOLUME }) as Phaser.Sound.WebAudioSound;
  sound.play();
  current = { name, sound };
}

export function stopMusic() {
  current?.sound.destroy();
  current = null;
}

/** Pause and resume with the race. */
export function pauseMusic(on: boolean) {
  if (!current) return;
  if (on && current.sound.isPlaying) current.sound.pause();
  else if (!on && current.sound.isPaused) current.sound.resume();
}

/**
 * The beat's punch, for things that pulse with the music: 1 on each beat, falling away to 0 before the next. 0 with
 * no music playing, muted, or before the audio is unlocked.
 */
export function musicBeat() {
  const sm = current?.sound.manager as Phaser.Sound.WebAudioSoundManager | undefined;
  if (!current?.sound.isPlaying || !sm || sm.mute || sm.context.state !== 'running') return 0;
  const beat = (current.sound.seek * SONGS[current.name].bpm) / 60;
  return (1 - (beat - Math.floor(beat))) ** 3;
}

/** Dev: what's playing. */
export const musicNow = () => (current ? { name: current.name, playing: current.sound.isPlaying, paused: current.sound.isPaused } : null);
