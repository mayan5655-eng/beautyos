// lib/design/reelMusic.js
//
// Royalty-free music for "תבניות רילס" (lib/design/reelTemplates.js), made in her browser. No track is downloaded and
// none is copyrighted: every sound is synthesized here from sine waves and seeded noise, so there is nothing to
// license and nothing that Instagram's audio matcher can flag.
//
// Why plain JavaScript and not OfflineAudioContext nodes: the same function runs in the test suite (node has no Web
// Audio) and in the phone, sample for sample, so the tests below measure the music that ships: its length, its peak
// (never clipping), its loudness, and that the same inputs always give the same file. The browser turns the samples
// into a WAV (encodeWav) and the reel encoder decodes that with OfflineAudioContext and mixes it in as AAC
// (app/design/reelEncoder.js), or plays it through an AudioContext into the MediaRecorder take.
//
// How it is kept pleasant (the brief: "no harsh square waves"):
//   * every voice is a sine or a soft additive wave (harmonics falling off as 1/n^2), never a raw square or saw;
//   * every note has an attack and a release, and the pads, bass and plucks go through a low-pass filter;
//   * a small stereo reverb (comb + all-pass, Freeverb style) and a ping-pong delay on the keys give it air;
//   * the master is brought to a fixed loudness, then a soft limiter, then a fade; the peak stays under -1 dBFS.
//
// Each mood has a BPM, and the templates put every cut on that beat grid (planTemplateReel). The arrangement knows
// where the closing card starts: the drums drop out there and the last chord rings, so the reel ends like a song.

export const MOODS = [
  { id: 'spa', label: 'רגוע וספא', bpm: 72, hint: 'פד רך ופסנתר חשמלי, כמעט בלי תופים' },
  { id: 'luxe', label: 'יוקרתי', bpm: 80, hint: 'אקורדים עמוקים, קצב איטי ואלגנטי' },
  { id: 'lofi', label: 'לו-פיי', bpm: 86, hint: 'קצב רך עם סווינג וחום של תקליט' },
  { id: 'groove', label: 'גרוב רך', bpm: 96, hint: 'בס קופצני וקצב שזורם' },
  { id: 'pop', label: 'פופ שמח', bpm: 120, hint: 'קצב ישר, ארפג׳יו נוצץ' },
  { id: 'energy', label: 'אנרגטי', bpm: 128, hint: 'קצב מועדון, מתאים לקאטים מהירים' },
];

export const moodById = (id) => MOODS.find((m) => m.id === id) || null;

/** Peak target: never above -1 dBFS. */
export const PEAK_MAX = 0.891;
/** Loudness target for the mix before the limiter, as RMS (about -17 dBFS: present on a phone, not a wall). */
const RMS_TARGET = 0.14;

// ── Small DSP kit ────────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32): the same seed gives the same noise, so the same reel always gets the same music. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TABLE = 4096;
const SINE = new Float32Array(TABLE + 1);
const SOFT = new Float32Array(TABLE + 1);
for (let i = 0; i <= TABLE; i++) {
  const p = (i / TABLE) * Math.PI * 2;
  SINE[i] = Math.sin(p);
  // soft additive wave: 1/n^2 harmonics (a rounded triangle-like tone, warm, no buzz)
  let s = 0;
  for (let n = 1; n <= 6; n++) s += Math.sin(p * n) / (n * n);
  SOFT[i] = s / 1.34;
}
const look = (tab, phase) => {
  const x = (phase - Math.floor(phase)) * TABLE;
  const i = x | 0;
  return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** A biquad (RBJ cookbook), run over a mono buffer in place. */
function biquad(buf, type, freq, q, sr) {
  const w = (2 * Math.PI * freq) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2;
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; } // band-pass, 0 dB peak
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}

/** ADSR envelope value at t seconds into a note held for `hold` seconds. */
function adsr(t, hold, a, d, s, r) {
  if (t < 0) return 0;
  let v;
  if (t < a) v = t / a;
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d);
  else v = s;
  if (t > hold) {
    const held = hold < a ? hold / a : hold < a + d ? 1 - (1 - s) * ((hold - a) / d) : s;
    const k = (t - hold) / r;
    return k >= 1 ? 0 : held * (1 - k) * (1 - k);
  }
  return v;
}

/** Mix a mono voice into the stereo bus with equal-power pan (-1 left .. 1 right) and an optional send. */
function place(L, R, voice, start, gain, pan, send, sendGain) {
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain, gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  const n = Math.min(voice.length, L.length - start);
  for (let i = Math.max(0, -start); i < n; i++) {
    const v = voice[i];
    L[start + i] += v * gl; R[start + i] += v * gr;
    if (send) send[start + i] += v * sendGain;
  }
}

// ── Voices (each returns a mono Float32Array) ───────────────────────────────

function kick(sr, punch = 1) {
  const n = Math.round(sr * 0.42), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 46 + 80 * Math.exp(-t / 0.028);
    ph += f / sr;
    const amp = Math.exp(-t / 0.2) * Math.min(1, t / 0.002);
    out[i] = Math.tanh(1.6 * look(SINE, ph) * amp) * 0.9 * punch;
  }
  return out;
}

function noiseBurst(sr, rand, ms) {
  const n = Math.round((sr * ms) / 1000), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1;
  return out;
}

function hat(sr, rand, open = false) {
  const out = noiseBurst(sr, rand, open ? 260 : 70);
  biquad(out, 'hp', 7200, 0.7, sr);
  biquad(out, 'lp', 13000, 0.7, sr);
  const tau = open ? 0.11 : 0.022;
  for (let i = 0; i < out.length; i++) out[i] *= Math.exp(-(i / sr) / tau) * Math.min(1, i / (sr * 0.001));
  return out;
}

function shaker(sr, rand) {
  const out = noiseBurst(sr, rand, 90);
  biquad(out, 'bp', 5200, 1.2, sr);
  for (let i = 0; i < out.length; i++) { const t = i / sr; out[i] *= Math.min(1, t / 0.012) * Math.exp(-t / 0.03); }
  return out;
}

function clap(sr, rand) {
  const out = noiseBurst(sr, rand, 260);
  biquad(out, 'bp', 1350, 0.9, sr);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    // three quick hits then a tail: what makes a clap sound like hands, not a hiss
    const burst = t < 0.03 ? Math.exp(-((t % 0.01) / 0.003)) : 0;
    out[i] *= (burst * 0.9 + Math.exp(-t / 0.07) * 0.8) * 1.4;
  }
  return out;
}

function rim(sr) {
  const n = Math.round(sr * 0.08), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr; out[i] = (Math.sin(2 * Math.PI * 1700 * t) * 0.6 + Math.sin(2 * Math.PI * 820 * t) * 0.4) * Math.exp(-t / 0.012); }
  return out;
}

function bassNote(sr, midi, hold) {
  const f = mtof(midi), n = Math.round(sr * (hold + 0.12)), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += f / sr;
    // fundamental plus 2nd and 3rd harmonics: a phone speaker cannot play 55 Hz, it can play 110 and 165
    const s = look(SINE, ph) + 0.35 * look(SINE, ph * 2) + 0.12 * look(SINE, ph * 3);
    out[i] = s * adsr(t, hold, 0.006, 0.12, 0.7, 0.09) * 0.55;
  }
  return biquad(out, 'lp', 900, 0.7, sr);
}

function padChord(sr, notes, hold, bright = 1, cents = 6, seedPhase = 0) {
  const n = Math.round(sr * (hold + 1.2)), out = new Float32Array(n);
  for (let k = 0; k < notes.length; k++) {
    const f = mtof(notes[k]);
    for (const det of [-cents, cents]) {
      const ff = f * Math.pow(2, det / 1200);
      let ph = seedPhase + k * 0.17 + (det > 0 ? 0.31 : 0);
      for (let i = 0; i < n; i++) { ph += ff / sr; out[i] += look(SOFT, ph); }
    }
  }
  const norm = 1 / (notes.length * 2);
  for (let i = 0; i < n; i++) out[i] *= adsr(i / sr, hold, 0.45, 0.6, 0.8, 1.1) * norm;
  return biquad(out, 'lp', 1400 * bright, 0.6, sr);
}

/** Electric piano by FM: a bell-like attack that softens into a sine. */
function epNote(sr, midi, hold, vel = 1) {
  const f = mtof(midi), n = Math.round(sr * (hold + 0.8)), out = new Float32Array(n);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    pc += f / sr; pm += f / sr;
    const idx = 1.6 * Math.exp(-t / 0.25) * vel;
    out[i] = look(SINE, pc + (idx * look(SINE, pm)) / (2 * Math.PI)) * adsr(t, hold, 0.004, 0.9, 0.35, 0.6) * vel;
  }
  return out;
}

function pluck(sr, midi, vel = 1) {
  const f = mtof(midi), n = Math.round(sr * 0.5), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += f / sr; out[i] = look(SOFT, ph) * Math.exp(-t / 0.13) * Math.min(1, t / 0.003) * vel; }
  return biquad(out, 'lp', 3200, 0.7, sr);
}

function bell(sr, midi) {
  const f = mtof(midi), n = Math.round(sr * 1.8), out = new Float32Array(n);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    pc += f / sr; pm += (f * 3.5) / sr;
    out[i] = look(SINE, pc + (0.5 * Math.exp(-t / 0.4) * look(SINE, pm)) / (2 * Math.PI)) * Math.exp(-t / 0.55) * Math.min(1, t / 0.002);
  }
  return out;
}

/** A soft noise swell that ends exactly on a cut (a whip or a flash): `ms` long, rising. */
function whoosh(sr, rand, ms) {
  const out = noiseBurst(sr, rand, ms);
  biquad(out, 'bp', 2400, 0.6, sr);
  const n = out.length;
  for (let i = 0; i < n; i++) { const p = i / n; out[i] *= p * p * (1 - Math.max(0, (p - 0.92) / 0.08)); }
  return out;
}

/** A low, round hit on a reveal: a falling sine with a short airy tail. */
function impact(sr, rand) {
  const n = Math.round(sr * 0.9), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += (38 + 60 * Math.exp(-t / 0.06)) / sr; out[i] = look(SINE, ph) * Math.exp(-t / 0.35); }
  const air = noiseBurst(sr, rand, 500);
  biquad(air, 'hp', 3000, 0.7, sr);
  for (let i = 0; i < air.length; i++) out[i] += air[i] * 0.04 * Math.exp(-(i / sr) / 0.12);
  return out;
}

/** Freeverb-style stereo reverb of a mono send (4 combs + 2 all-passes per side). */
function reverb(send, sr, room = 0.8, damp = 0.3) {
  const scale = sr / 44100;
  const combs = [1557, 1617, 1491, 1422], aps = [556, 441];
  const side = (spread) => {
    const out = new Float32Array(send.length);
    for (const c of combs) {
      const len = Math.round((c + spread) * scale), buf = new Float32Array(len);
      let idx = 0, filt = 0;
      for (let i = 0; i < send.length; i++) {
        const y = buf[idx];
        filt = y * (1 - damp) + filt * damp;
        buf[idx] = send[i] * 0.03 + filt * room;
        out[i] += y;
        if (++idx >= len) idx = 0;
      }
    }
    for (const a of aps) {
      const len = Math.round((a + spread) * scale), buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < out.length; i++) {
        const b = buf[idx], x = out[i];
        out[i] = -x + b;
        buf[idx] = x + b * 0.5;
        if (++idx >= len) idx = 0;
      }
    }
    return out;
  };
  return [side(0), side(23)];
}

/** Ping-pong delay of a mono send; `step` in samples. */
function pingPong(send, step, fb = 0.35) {
  const L = new Float32Array(send.length), R = new Float32Array(send.length);
  for (let i = 0; i < send.length; i++) {
    const a = i - step;
    if (a < 0) continue;
    L[i] = send[a] + R[a] * fb;
    R[i] = L[a] * fb;
  }
  return [L, R];
}

// ── Moods: chords and patterns ──────────────────────────────────────────────
// 16 steps per bar. 'x' = hit, 'o' = soft hit. A chord per bar, looping every four bars. Pad notes sit in the middle
// register (MIDI 55..76) so they are warm on a phone and never shrill; the bass root is an octave or two below.

const STYLE = {
  spa: {
    chords: [{ r: 41, p: [57, 60, 64, 67] }, { r: 38, p: [57, 60, 65, 69] }, { r: 46, p: [57, 62, 65, 69] }, { r: 36, p: [55, 60, 64, 67] }],
    kick: 'x...............', clap: '', hat: '', shaker: '..o...o...o...o.', bass: 'x...............',
    ep: 'x.....x.........', arp: '', bells: 0.35, pad: 1, bright: 0.8, swing: 0, duck: 0, kickGain: 0.35, crackle: 0, keys: 'ep',
  },
  luxe: {
    chords: [{ r: 45, p: [60, 64, 67, 71] }, { r: 41, p: [60, 64, 69, 72] }, { r: 48, p: [59, 64, 67, 71] }, { r: 43, p: [59, 62, 67, 69] }],
    kick: 'x.......x.......', clap: '', rim: '....x.......x...', hat: '..o...o...o...o.', shaker: '', bass: 'x.......x..x....',
    ep: 'x...x...x...x...', arp: '', bells: 0.15, pad: 0.9, bright: 1, swing: 0, duck: 0, kickGain: 0.6, crackle: 0, keys: 'ep',
  },
  lofi: {
    chords: [{ r: 41, p: [57, 60, 64, 69] }, { r: 40, p: [55, 59, 62, 67] }, { r: 38, p: [57, 60, 65, 69] }, { r: 36, p: [55, 59, 64, 67] }],
    kick: 'x.......x.x.....', clap: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', shaker: '', bass: 'x.....x.x.......',
    ep: 'x......x..x.....', arp: '', bells: 0, pad: 0.7, bright: 0.6, swing: 0.16, duck: 0, kickGain: 0.75, crackle: 1, keys: 'ep',
  },
  groove: {
    chords: [{ r: 43, p: [59, 62, 66, 69] }, { r: 40, p: [59, 62, 66, 67] }, { r: 36, p: [59, 62, 64, 67] }, { r: 38, p: [57, 62, 66, 69] }],
    kick: 'x.....x...x.....', clap: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', shaker: '', bass: 'x..x..x...x..x..',
    ep: '', arp: '..x...x...x...x.', bells: 0, pad: 0.8, bright: 1, swing: 0.08, duck: 0.25, kickGain: 0.85, crackle: 0, keys: 'pluck',
  },
  pop: {
    chords: [{ r: 48, p: [60, 64, 67, 72] }, { r: 43, p: [59, 62, 67, 71] }, { r: 45, p: [60, 64, 69, 72] }, { r: 41, p: [60, 65, 69, 72] }],
    kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', shaker: 'oooooooooooooooo', bass: 'x.x.x.x.x.x.x.x.',
    ep: '', arp: 'xxxxxxxxxxxxxxxx', bells: 0, pad: 0.75, bright: 1.3, swing: 0, duck: 0.45, kickGain: 0.95, crackle: 0, keys: 'pluck',
  },
  energy: {
    chords: [{ r: 45, p: [60, 64, 69, 72] }, { r: 41, p: [60, 65, 69, 72] }, { r: 48, p: [60, 64, 67, 72] }, { r: 43, p: [59, 62, 67, 71] }],
    kick: 'x...x...x...x...', clap: '....x.......x..o', hat: 'xxxxxxxxxxxxxxxx', open: '..x...x...x...x.', shaker: '', bass: '..x...x...x...x.',
    ep: '', arp: 'x.xxx.xxx.xxx.xx', bells: 0, pad: 0.7, bright: 1.5, swing: 0, duck: 0.6, kickGain: 1, crackle: 0, keys: 'pluck',
  },
};

const PENTA = [0, 2, 4, 7, 9];

/**
 * Render a mood to stereo samples.
 * @param {string} moodId
 * @param {{ durationMs: number, endStartMs?: number, sampleRate?: number, seed?: number, hits?: { ms: number, kind: 'whoosh'|'impact' }[] }} opts
 *   `endStartMs`: where the closing card starts (drums drop out there). `hits`: sounds placed on transitions.
 * @returns {{ sampleRate: number, channels: [Float32Array, Float32Array], bpm: number }}
 */
export function renderMood(moodId, { durationMs, endStartMs, sampleRate = 48000, seed = 1, hits = [] } = {}) {
  const mood = moodById(moodId) || MOODS[0];
  const st = STYLE[mood.id];
  const sr = sampleRate;
  const n = Math.max(1, Math.round((Math.max(0, Number(durationMs) || 0) / 1000) * sr));
  const L = new Float32Array(n), R = new Float32Array(n);
  const verb = new Float32Array(n), dly = new Float32Array(n);
  const padL = new Float32Array(n), padR = new Float32Array(n);
  const rand = rng(seed * 7919 + mood.bpm);
  const beat = 60 / mood.bpm, step = beat / 4;
  const endAt = Math.min(n, Math.round(((endStartMs ?? durationMs) / 1000) * sr));
  const bars = Math.ceil(n / sr / (beat * 4)) + 1;

  // pre-rendered one-shots
  const K = kick(sr), C = clap(sr, rand), Hc = hat(sr, rand), Ho = hat(sr, rand, true), S = shaker(sr, rand), RIM = rim(sr);
  const kickTimes = [];
  const at = (sec) => Math.round(sec * sr);
  const hitAt = (p, i) => p && (p[i] === 'x' || p[i] === 'o') ? (p[i] === 'x' ? 1 : 0.55) : 0;

  for (let b = 0; b < bars; b++) {
    const barT = b * beat * 4;
    const ch = st.chords[b % st.chords.length];
    const barStart = at(barT);
    if (barStart >= n) break;
    const inEnd = barStart >= endAt;
    // pads: one chord per bar (sustained through the closing card)
    if (st.pad > 0) {
      const pv = padChord(sr, ch.p, beat * 4, st.bright, 6, b * 0.13);
      place(padL, padR, pv, barStart, 0.55 * st.pad, -0.25, verb, 0.5);
      const pv2 = padChord(sr, ch.p.map((m) => m + 12).slice(1, 3), beat * 4, st.bright * 0.8, 9, b * 0.29);
      place(padL, padR, pv2, barStart, 0.18 * st.pad, 0.35, verb, 0.5);
    }
    for (let s = 0; s < 16; s++) {
      const swing = s % 2 === 1 ? st.swing * step : 0;
      const t = barT + s * step + swing;
      const i0 = at(t);
      if (i0 >= n) break;
      const drums = !inEnd && i0 < endAt; // drums stop on the closing card
      if (drums) {
        const k = hitAt(st.kick, s);
        if (k) { place(L, R, K, i0, 0.8 * st.kickGain * k, 0, null, 0); kickTimes.push(i0); }
        const c = hitAt(st.clap, s);
        if (c) place(L, R, C, i0, 0.34 * c, 0.05, verb, 0.35);
        const rm = hitAt(st.rim, s);
        if (rm) place(L, R, RIM, i0, 0.16 * rm, -0.2, verb, 0.3);
        const h = hitAt(st.hat, s);
        if (h) place(L, R, Hc, i0, 0.16 * h * (s % 4 === 2 ? 1 : 0.75), 0.3, null, 0);
        const o = hitAt(st.open, s);
        if (o) place(L, R, Ho, i0, 0.11 * o, -0.3, verb, 0.1);
        const sh = hitAt(st.shaker, s);
        if (sh) place(L, R, S, i0, 0.1 * sh * (s % 2 ? 0.7 : 1), -0.35, null, 0);
      }
      // bass (also stops on the closing card, so the last chord can ring)
      const bs = hitAt(st.bass, s);
      if (bs && i0 < endAt) {
        let len = 1; while (s + len < 16 && !hitAt(st.bass, s + len)) len++;
        const midi = ch.r + (st.bass === 'x.x.x.x.x.x.x.x.' && s % 4 === 2 ? 12 : 0);
        place(L, R, bassNote(sr, midi, Math.min(len * step * 0.9, beat * 2)), i0, 0.62 * bs, 0, null, 0);
      }
      // keys: electric-piano chords or a plucked arpeggio
      if (st.keys === 'ep' && hitAt(st.ep, s) && i0 < endAt) {
        ch.p.forEach((m, j) => place(L, R, epNote(sr, m + 12, beat * 1.5, 0.7 - j * 0.08), i0 + at(j * 0.012), 0.11, j % 2 ? 0.3 : -0.3, dly, 0.25));
      }
      if (st.keys === 'pluck' && hitAt(st.arp, s) && i0 < endAt) {
        const order = [0, 1, 2, 3, 2, 1];
        const m = ch.p[order[(b * 16 + s) % order.length]] + 12;
        place(L, R, pluck(sr, m, 0.8), i0, 0.12, s % 2 ? 0.4 : -0.4, dly, 0.3);
      }
      // a few sparkles on calm moods
      if (st.bells && s % 4 === 0 && rand() < st.bells * 0.35 && i0 < endAt) {
        const m = 72 + PENTA[Math.floor(rand() * PENTA.length)] + (rand() < 0.3 ? 12 : 0) + (ch.r % 12) - 5;
        place(L, R, bell(sr, m), i0, 0.07, rand() * 1.2 - 0.6, verb, 0.7);
      }
    }
  }

  // the closing card: one soft bell on the tonic, then the last chord rings out
  if (endAt < n) {
    const ch = st.chords[0];
    place(L, R, bell(sr, ch.p[2] + 12), endAt, 0.11, 0.1, verb, 0.8);
    place(padL, padR, padChord(sr, ch.p, (n - endAt) / sr, st.bright * 0.8, 6, 0.5), endAt, 0.3 * st.pad + 0.1, 0, verb, 0.6);
  }

  // transition sounds, on the cut
  for (const h of hits || []) {
    const i = at((Number(h.ms) || 0) / 1000);
    if (!(i > 0 && i < n)) continue;
    if (h.kind === 'impact') place(L, R, impact(sr, rand), i, 0.3 * st.kickGain, 0, verb, 0.25);
    else { const w = whoosh(sr, rand, 240); place(L, R, w, i - w.length, 0.09 * st.kickGain, 0.2, verb, 0.2); }
  }

  // vinyl crackle for lo-fi: sparse, quiet clicks
  if (st.crackle) {
    for (let i = 0; i < n; i++) if (rand() < 6 / sr) { const v = (rand() * 2 - 1) * 0.05; L[i] += v; R[i] += v * 0.8; }
  }

  // pads, ducked under the kick (the gentle "pump" of pop and club music)
  if (st.duck) {
    const g = new Float32Array(n).fill(1);
    const tau = 0.16 * sr;
    for (const k0 of kickTimes) for (let i = k0; i < Math.min(n, k0 + Math.round(tau * 3)); i++) g[i] = Math.min(g[i], 1 - st.duck * Math.exp(-(i - k0) / tau));
    for (let i = 0; i < n; i++) { padL[i] *= g[i]; padR[i] *= g[i]; }
  }
  for (let i = 0; i < n; i++) { L[i] += padL[i]; R[i] += padR[i]; }

  // delay (dotted eighth) and reverb
  const [dl, dr] = pingPong(dly, Math.round(beat * 0.75 * sr), 0.32);
  for (let i = 0; i < n; i++) { L[i] += dl[i] * 0.5; R[i] += dr[i] * 0.5; }
  const [vl, vr] = reverb(verb, sr, 0.8, 0.35);
  for (let i = 0; i < n; i++) { L[i] += vl[i] * 0.9; R[i] += vr[i] * 0.9; }

  master(L, R, sr);
  return { sampleRate: sr, channels: [L, R], bpm: mood.bpm };
}

/** Loudness to target, a soft limiter, a short fade in and a fade out, then a hard guarantee of the peak ceiling. */
function master(L, R, sr) {
  const n = L.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += L[i] * L[i] + R[i] * R[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1e-9;
  const g = RMS_TARGET / rms;
  const fadeIn = Math.round(sr * 0.012), fadeOut = Math.min(n, Math.round(sr * 1.2));
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let fade = 1;
    if (i < fadeIn) fade = i / fadeIn;
    if (i > n - fadeOut) fade *= Math.max(0, (n - i) / fadeOut);
    // tanh is linear below about 0.3, and rounds the few peaks above it instead of clipping them
    L[i] = Math.tanh(L[i] * g * 1.15) * fade;
    R[i] = Math.tanh(R[i] * g * 1.15) * fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  if (peak > PEAK_MAX) { const k = PEAK_MAX / peak; for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; } }
}

/** Peak and RMS (linear and dBFS) of rendered channels, and how many samples sit at full scale. */
export function audioStats(channels) {
  let peak = 0, sum = 0, count = 0, clipped = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) {
    const a = Math.abs(ch[i]);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += ch[i] * ch[i]; count++;
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  return { peak, rms, peakDb: db(peak), rmsDb: db(rms), clipped };
}

/** 16-bit PCM WAV of the channels: what the browser decodes (every browser decodes WAV) and mixes into the reel. */
export function encodeWav(channels, sampleRate) {
  const ch = channels.length, n = channels[0].length;
  const bytes = 44 + n * ch * 2;
  const buf = new ArrayBuffer(bytes), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true); o += 2;
  }
  return new Uint8Array(buf);
}
