// marketing/promo-music.mjs
//
// The promo video's music: original, made here from sine waves and seeded noise by the same instruments as the reel templates'
// music (lib/design/reelMusic.js `voices`), so there is nothing to license and nothing for Instagram's audio matcher to flag.
// No sample, no download, no paid API. Same inputs, same samples, every run.
//
// 120 BPM: a beat is 0.5 s and a bar 2 s, and promo-motion.mjs cuts its scenes on that grid, so every cut lands on a beat.
// The arrangement follows the story instead of looping one groove:
//   hook    a low A-minor pad and a heartbeat kick: the pain line lands in near silence
//   pain    A minor (Am F C G), half-time drums, muted plucks: busy and a little tense
//   build   one bar: claps doubling up, a rising noise swell, everything else drops out
//   main    the lift into C major (C G Am F, the same notes, so it opens up rather than jumps): four-on-the-floor, claps on 2 and 4,
//           shaker, bouncing octave bass, a plucked arpeggio and a short hook melody every other bar; the pads breathe with the kick
//   climax  main plus bells and a brighter pad, an impact on its first beat
//   outro   the drums and bass stop, one bell, the last C chord rings out
//
//   node promo-music.mjs [seconds]      writes out/promo/promo-music.wav (the 90 s arrangement) for listening on its own

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { voices, audioStats, encodeWav, PEAK_MAX } from '../lib/design/reelMusic.js';

const { rng, mtof, place, kick, hat, shaker, clap, bassNote, padChord, epNote, pluck, bell, whoosh, impact, reverb, pingPong, master, noiseBurst, biquad } = voices;

export const BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4;

const MINOR = [{ r: 45, p: [57, 60, 64, 69] }, { r: 41, p: [57, 60, 65, 69] }, { r: 48, p: [55, 60, 64, 67] }, { r: 43, p: [55, 59, 62, 67] }];
const MAJOR = [{ r: 48, p: [60, 64, 67, 72] }, { r: 43, p: [59, 62, 67, 71] }, { r: 45, p: [60, 64, 69, 72] }, { r: 41, p: [60, 65, 69, 72] }];

// 16 steps a bar; 'x' a hit, 'o' a soft one
const SECTION = {
  hook: { chords: MINOR, pad: 0.9, bright: 0.45, kick: 'x.......x.......', kickGain: 0.45, clap: '', hat: '', shaker: '', bass: '', arp: '', melody: false, bells: false, duck: 0 },
  pain: { chords: MINOR, pad: 0.6, bright: 0.6, kick: 'x.........x.....', kickGain: 0.8, clap: '........x.......', hat: 'o.o.o.o.o.o.o.o.', shaker: '', bass: 'x.....x...x.....', arp: 'x..x..x...x..x..', arpGain: 0.08, melody: false, bells: false, duck: 0.2 },
  build: { chords: MINOR, pad: 0.4, bright: 0.9, kick: '', kickGain: 0, clap: 'x...x...x.x.xxxx', hat: '', shaker: 'oooooooooooooooo', bass: '', arp: '', melody: false, bells: false, duck: 0, riser: true },
  main: { chords: MAJOR, pad: 0.75, bright: 1.25, kick: 'x...x...x...x...', kickGain: 0.95, clap: '....x.......x...', hat: '..x...x...x...x.', shaker: 'oooooooooooooooo', bass: 'x.x.x.x.x.x.x.x.', arp: 'x.xxx.xxx.xxx.xx', arpGain: 0.11, melody: true, bells: false, duck: 0.45 },
  climax: { chords: MAJOR, pad: 0.95, bright: 1.6, kick: 'x...x...x...x...', kickGain: 1, clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', shaker: 'oooooooooooooooo', bass: 'x.x.x.x.x.x.x.x.', arp: 'xxxxxxxxxxxxxxxx', arpGain: 0.11, melody: true, bells: true, duck: 0.5 },
  outro: { chords: MAJOR, pad: 0.9, bright: 1, kick: '', kickGain: 0, clap: '', hat: '', shaker: '', bass: '', arp: '', melody: false, bells: false, duck: 0, ring: true },
};
// the hook melody: (step, chord-tone index, octave) - two bars long, played over the first two bars of every four
const MELODY = [[[0, 3, 12], [3, 2, 12], [6, 3, 12], [10, 1, 12], [12, 2, 12]], [[0, 2, 12], [4, 1, 12], [8, 0, 12], [11, 1, 12]]];

const hitOf = (p, i) => (p && (p[i] === 'x' || p[i] === 'o') ? (p[i] === 'x' ? 1 : 0.55) : 0);

/**
 * sections: [{ kind, bars }] in order, starting at 0 s. seconds: the exact length (the last section is cut or extended to it).
 * hits: [{ s, kind: 'impact' | 'whoosh' }] accents on the cuts (seconds). Returns { sampleRate, channels }.
 */
export function renderPromoTrack({ sections, seconds, hits = [], sampleRate = 48000, seed = 11 }) {
  const sr = sampleRate, n = Math.round(seconds * sr);
  const L = new Float32Array(n), R = new Float32Array(n), verb = new Float32Array(n), dly = new Float32Array(n), padL = new Float32Array(n), padR = new Float32Array(n);
  const rand = rng(seed);
  const at = (s) => Math.round(s * sr);
  const step = BEAT / 4;
  const K = kick(sr), C = clap(sr, rand), Hc = hat(sr, rand), S = shaker(sr, rand);
  const kickTimes = [];
  // bar -> section
  const plan = [];
  for (const s of sections) for (let b = 0; b < s.bars; b++) plan.push({ kind: s.kind, inSection: b, sectionBars: s.bars });
  while (plan.length * BAR < seconds + BAR) plan.push({ ...plan[plan.length - 1], inSection: plan[plan.length - 1].inSection + 1 });

  let majorBar = 0;
  plan.forEach((pb, b) => {
    const st = SECTION[pb.kind], barT = b * BAR, i0bar = at(barT);
    if (i0bar >= n) return;
    const major = st.chords === MAJOR;
    const ch = st.chords[(major ? majorBar : b) % 4];
    if (major) majorBar++;
    if (st.ring && pb.inSection === 0) {
      place(L, R, bell(sr, MAJOR[0].p[2] + 12), i0bar, 0.12, 0.1, verb, 0.8);
      place(padL, padR, padChord(sr, MAJOR[0].p, Math.max(1, seconds - barT), 0.9, 6, 0.5), i0bar, 0.45, 0, verb, 0.6);
      return;
    }
    if (st.ring) return;
    // pads: one chord a bar, a second voice an octave up
    const pv = padChord(sr, ch.p, BAR, st.bright, 6, b * 0.13);
    place(padL, padR, pv, i0bar, 0.55 * st.pad, -0.25, verb, 0.5);
    place(padL, padR, padChord(sr, ch.p.map((m) => m + 12).slice(1, 3), BAR, st.bright * 0.8, 9, b * 0.29), i0bar, 0.18 * st.pad, 0.35, verb, 0.5);
    if (st.riser) {
      const w = whoosh(sr, rand, BAR * 1000);
      place(L, R, w, i0bar, 0.22, 0, verb, 0.3);
    }
    for (let s = 0; s < 16; s++) {
      const i0 = at(barT + s * step);
      if (i0 >= n) break;
      const k = hitOf(st.kick, s);
      if (k) { place(L, R, K, i0, 0.8 * st.kickGain * k, 0, null, 0); kickTimes.push(i0); }
      const c = hitOf(st.clap, s);
      if (c) place(L, R, C, i0, (st.riser ? 0.18 + 0.2 * (s / 16) : 0.34) * c, 0.05, verb, 0.35);
      const h = hitOf(st.hat, s);
      if (h) place(L, R, Hc, i0, 0.15 * h * (s % 4 === 2 ? 1 : 0.7), 0.3, null, 0);
      const sh = hitOf(st.shaker, s);
      if (sh) place(L, R, S, i0, 0.09 * sh * (s % 2 ? 0.7 : 1), -0.35, null, 0);
      const bs = hitOf(st.bass, s);
      if (bs) {
        let len = 1; while (s + len < 16 && !hitOf(st.bass, s + len)) len++;
        const midi = ch.r + (major && s % 4 === 2 ? 12 : 0);
        place(L, R, bassNote(sr, midi, Math.min(len * step * 0.9, BEAT * 2)), i0, 0.6 * bs, 0, null, 0);
      }
      if (hitOf(st.arp, s)) {
        const order = [0, 1, 2, 3, 2, 1];
        const m = ch.p[order[(b * 16 + s) % order.length]] + 12;
        place(L, R, pluck(sr, m, major ? 0.8 : 0.55), i0, st.arpGain, s % 2 ? 0.4 : -0.4, dly, 0.3);
      }
      if (st.bells && s % 4 === 0 && rand() < 0.35) {
        const PENTA = [0, 2, 4, 7, 9];
        place(L, R, bell(sr, 84 + PENTA[Math.floor(rand() * 5)]), i0, 0.06, rand() * 1.2 - 0.6, verb, 0.7);
      }
    }
    // the hook melody (electric piano), on the first two bars of every four in the major sections
    if (st.melody && (majorBar - 1) % 4 < 2) {
      for (const [s, idx, oct] of MELODY[(majorBar - 1) % 2]) {
        place(L, R, epNote(sr, ch.p[idx] + oct, BEAT * 0.9, 0.85), at(barT + s * step), 0.16, 0.1, dly, 0.35);
      }
    }
  });

  for (const h of hits) {
    const i = at(h.s);
    if (!(i > 0 && i < n)) continue;
    if (h.kind === 'impact') place(L, R, impact(sr, rand), i, 0.32, 0, verb, 0.25);
    else { const w = whoosh(sr, rand, 300); place(L, R, w, i - w.length, 0.1, 0.2, verb, 0.2); }
  }

  // the pads breathe with the kick (sidechain pump), per section depth
  const g = new Float32Array(n).fill(1), tau = 0.16 * sr;
  for (const k0 of kickTimes) {
    const depth = SECTION[plan[Math.min(plan.length - 1, Math.floor(k0 / sr / BAR))].kind].duck;
    for (let i = k0; i < Math.min(n, k0 + Math.round(tau * 3)); i++) g[i] = Math.min(g[i], 1 - depth * Math.exp(-(i - k0) / tau));
  }
  for (let i = 0; i < n; i++) { L[i] += padL[i] * g[i]; R[i] += padR[i] * g[i]; }
  const [dl, dr] = pingPong(dly, Math.round(BEAT * 0.75 * sr), 0.3);
  for (let i = 0; i < n; i++) { L[i] += dl[i] * 0.5; R[i] += dr[i] * 0.5; }
  const [vl, vr] = reverb(verb, sr, 0.8, 0.35);
  for (let i = 0; i < n; i++) { L[i] += vl[i] * 0.9; R[i] += vr[i] * 0.9; }
  master(L, R, sr);
  void noiseBurst; void biquad; void mtof;
  return { sampleRate: sr, channels: [L, R] };
}

/** Render and write a 16-bit WAV; returns its stats (peak never above -1 dBFS). */
export function writePromoTrack(file, opts) {
  const { sampleRate, channels } = renderPromoTrack(opts);
  const st = audioStats(channels);
  if (st.peak > PEAK_MAX + 1e-6 || st.clipped) throw new Error(`music peak ${st.peakDb.toFixed(1)} dBFS, clipped ${st.clipped}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodeWav(channels, sampleRate));
  return st;
}

// the 90 s arrangement on its own: node promo-music.mjs
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'promo', 'promo-music.wav');
  const st = writePromoTrack(out, { seconds: 90, sections: [{ kind: 'hook', bars: 2 }, { kind: 'pain', bars: 6 }, { kind: 'build', bars: 1 }, { kind: 'main', bars: 27 }, { kind: 'climax', bars: 5 }, { kind: 'outro', bars: 4 }] });
  console.log(out, `peak ${st.peakDb.toFixed(1)} dBFS, rms ${st.rmsDb.toFixed(1)} dBFS`);
}
