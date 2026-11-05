// The generated music for "תבניות רילס" (lib/design/reelMusic.js): deterministic, the right length, never clipping,
// at a sensible loudness, not harsh, quiet where the drums drop out, and a valid WAV.
import assert from 'node:assert/strict';
import { MOODS, moodById, renderMood, audioStats, encodeWav, PEAK_MAX } from './lib/design/reelMusic.js';

const SR = 22050; // the tests render at half rate to stay quick; the same code runs at 48 kHz in the browser

const hashOf = (chs: Float32Array[]) => { let h = 0; for (const c of chs) for (let i = 0; i < c.length; i += 7) h = (h * 31 + Math.round(c[i] * 1e6)) | 0; return h; };
/** RMS of [a, b) seconds. */
const rmsOf = (chs: Float32Array[], sr: number, a: number, b: number) => {
  let s = 0, n = 0;
  for (const c of chs) for (let i = Math.floor(a * sr); i < Math.min(c.length, Math.floor(b * sr)); i++) { s += c[i] * c[i]; n++; }
  return Math.sqrt(s / Math.max(1, n));
};
/** How much of the signal is above ~5 kHz: the first difference, a crude high-pass, relative to the whole. */
const brightness = (ch: Float32Array) => {
  let d = 0, s = 0;
  for (let i = 1; i < ch.length; i++) { const x = ch[i] - ch[i - 1]; d += x * x; s += ch[i] * ch[i]; }
  return Math.sqrt(d / s);
};

assert.equal(new Set(MOODS.map((m) => m.id)).size, MOODS.length);
for (const m of MOODS) {
  assert.ok(m.bpm >= 60 && m.bpm <= 140 && m.label && m.hint);
  assert.ok(!/[‒-―]/.test(m.label + m.hint), 'no dashes in the mood copy');
}
assert.equal(moodById('nope'), null);

for (const m of MOODS) {
  const opts = { durationMs: 12000, endStartMs: 9500, sampleRate: SR, seed: 3, hits: [{ ms: 2500, kind: 'impact' as const }, { ms: 5000, kind: 'whoosh' as const }] };
  const a = renderMood(m.id, opts);
  const b = renderMood(m.id, opts);
  // deterministic: the same inputs, the same samples
  assert.equal(hashOf(a.channels), hashOf(b.channels), `${m.id}: deterministic`);
  assert.equal(a.bpm, m.bpm);
  // the right length, to the sample
  assert.equal(a.channels.length, 2);
  assert.equal(a.channels[0].length, Math.round(12 * SR), `${m.id}: exact length`);
  assert.equal(a.channels[1].length, a.channels[0].length);
  // no clipping, a ceiling under -1 dBFS, and loud enough to hear on a phone
  const st = audioStats(a.channels);
  assert.equal(st.clipped, 0, `${m.id}: no clipped samples`);
  assert.ok(st.peak <= PEAK_MAX + 1e-6, `${m.id}: peak ${st.peakDb.toFixed(2)} dBFS`);
  assert.ok(st.peak > 0.18, `${m.id}: not silent`);
  assert.ok(st.rmsDb > -24 && st.rmsDb < -12, `${m.id}: loudness ${st.rmsDb.toFixed(1)} dBFS RMS`);
  for (const ch of a.channels) for (let i = 0; i < ch.length; i += 97) assert.ok(Number.isFinite(ch[i]), 'no NaN');
  // pleasant, not a buzz: little energy in the very top (a square wave at these levels scores far higher)
  assert.ok(brightness(a.channels[0]) < 0.25, `${m.id}: brightness ${brightness(a.channels[0]).toFixed(3)}`);
  // it starts and ends softly (no click at either end)
  assert.ok(Math.abs(a.channels[0][0]) < 0.01 && Math.abs(a.channels[0].at(-1)!) < 0.01, `${m.id}: soft edges`);
  // the drums drop out on the closing card: the last seconds are quieter than the groove before them
  assert.ok(rmsOf(a.channels, SR, 10.2, 11) < rmsOf(a.channels, SR, 6, 9), `${m.id}: the ending is calmer`);
}
// a different seed changes the noise (hats, claps) but not the length
{
  const a = renderMood('pop', { durationMs: 4000, sampleRate: SR, seed: 1 });
  const b = renderMood('pop', { durationMs: 4000, sampleRate: SR, seed: 2 });
  assert.notEqual(hashOf(a.channels), hashOf(b.channels));
  assert.equal(a.channels[0].length, b.channels[0].length);
}
// the moods are different music: the energetic one is busier than the spa one
{
  // onsets: 10 ms frames whose energy at least doubles over the frame before (a hit)
  const busy = (id: string) => {
    const ch = renderMood(id, { durationMs: 8000, sampleRate: SR }).channels[0], f = Math.round(SR / 100);
    let prev = 1e-9, n = 0;
    for (let i = 0; i + f < ch.length; i += f) { let e = 0; for (let j = 0; j < f; j++) e += ch[i + j] ** 2; if (e > 2 * prev && e > 1e-4 * f) n++; prev = e; }
    return n;
  };
  assert.ok(busy('energy') > 1.5 * busy('spa'), 'energy has far more hits than spa');
}
// a square wave fails the same brightness check (the check means something)
{
  const sq = new Float32Array(SR * 2);
  for (let i = 0; i < sq.length; i++) sq[i] = (Math.floor((i * 440) / SR * 2) % 2 ? 0.3 : -0.3);
  assert.ok(brightness(sq) > 0.25, 'a raw square wave would be flagged harsh');
}
// at the real rate, a 30 s reel's worth renders to the sample
{
  const r = renderMood('luxe', { durationMs: 30000, endStartMs: 27000, sampleRate: 48000 });
  assert.equal(r.channels[0].length, 30 * 48000);
  assert.equal(audioStats(r.channels).clipped, 0);
}
// edge cases: zero length is one sample, never a crash
assert.equal(renderMood('spa', { durationMs: 0, sampleRate: SR }).channels[0].length, 1);

// WAV: a valid RIFF header and the right size
{
  const r = renderMood('lofi', { durationMs: 1000, sampleRate: SR });
  const w = encodeWav(r.channels, SR);
  const dv = new DataView(w.buffer);
  const str = (o: number, n: number) => String.fromCharCode(...w.slice(o, o + n));
  assert.equal(str(0, 4), 'RIFF'); assert.equal(str(8, 4), 'WAVE'); assert.equal(str(36, 4), 'data');
  assert.equal(dv.getUint16(22, true), 2, 'stereo');
  assert.equal(dv.getUint32(24, true), SR);
  assert.equal(dv.getUint16(34, true), 16);
  assert.equal(w.length, 44 + r.channels[0].length * 4);
  assert.equal(dv.getUint32(4, true), w.length - 8);
}

console.log('reel music: ok');
