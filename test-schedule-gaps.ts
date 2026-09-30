import assert from 'node:assert/strict';
import { tightGapAppointmentIds, TIGHT_GAP_MINUTES } from './lib/scheduleGaps.ts';

// Back-to-back, zero gap: the second one is flagged.
{
  const ids = tightGapAppointmentIds([
    { id: 'a', start: 540, end: 600 },
    { id: 'b', start: 600, end: 660 },
  ]);
  assert.deepEqual([...ids], ['b']);
}

// A real buffer (15 min, above the 10-minute default threshold): nothing flagged.
{
  const ids = tightGapAppointmentIds([
    { id: 'a', start: 540, end: 600 },
    { id: 'b', start: 615, end: 660 },
  ]);
  assert.equal(ids.size, 0);
}

// Exactly at the threshold does not count as tight - only strictly under it.
{
  const ids = tightGapAppointmentIds([
    { id: 'a', start: 540, end: 600 },
    { id: 'b', start: 600 + TIGHT_GAP_MINUTES, end: 700 },
  ]);
  assert.equal(ids.size, 0);
}

// An overlap (negative gap, from data older than the exclusion constraint) is flagged too.
{
  const ids = tightGapAppointmentIds([
    { id: 'a', start: 540, end: 600 },
    { id: 'b', start: 590, end: 650 },
  ]);
  assert.deepEqual([...ids], ['b']);
}

// A personal block still occupies time, so a client appointment right after it is flagged...
{
  const ids = tightGapAppointmentIds([
    { id: 'lunch', start: 780, end: 840, kind: 'personal' },
    { id: 'client', start: 840, end: 900 },
  ]);
  assert.deepEqual([...ids], ['client']);
}

// ...but a personal block is never itself flagged, even when it is tight against what came before.
{
  const ids = tightGapAppointmentIds([
    { id: 'client', start: 540, end: 600 },
    { id: 'lunch', start: 600, end: 660, kind: 'personal' },
  ]);
  assert.equal(ids.size, 0);
}

// A custom threshold is honoured.
{
  const ids = tightGapAppointmentIds(
    [
      { id: 'a', start: 540, end: 600 },
      { id: 'b', start: 615, end: 660 },
    ],
    20
  );
  assert.deepEqual([...ids], ['b']);
}

// Three in a row: only the second one is tight against the first; the third has real room.
{
  const ids = tightGapAppointmentIds([
    { id: 'a', start: 540, end: 600 },
    { id: 'b', start: 605, end: 650 },
    { id: 'c', start: 700, end: 750 },
  ]);
  assert.deepEqual([...ids], ['b']);
}

console.log('schedule gaps: ok');
