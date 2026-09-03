// lib/quiet.js
//
// Business quiet mode - "the salon is on a break" - and the comeback window.
//
// Two ways into quiet:
//   * MANUAL: automations.quiet === true, toggled in Settings → אוטומציות.
//     Turning it off stamps automations.quiet_ended_at.
//   * AUTOMATIC: the calendar itself says so - a business that HAS history but
//     no appointment in QUIET_GAP_DAYS is on a break whether or not she said
//     so. Deliberately silent: no banner, nothing to configure, it just stops
//     the product from asking questions while she is away.
//
// While quiet: no owner questions are created and none are shown.
//
// The COMEBACK: when quiet ends, the product waits COMEBACK_WAIT_DAYS before
// proposing to message the clients who lapsed during the break - day one back
// looks like pressure, a week back looks like care. The window closes after
// COMEBACK_WINDOW_DAYS so an old break never produces a stale question.
//
// Pure functions over plain data, no imports: callable from the browser
// (beautyos.jsx gates its question card on this) and from routes alike.

export const QUIET_GAP_DAYS = 10;
export const COMEBACK_WAIT_DAYS = 7;
export const COMEBACK_WINDOW_DAYS = 28;

const DAY_MS = 86400000;

function toTime(dateStr) {
  const t = new Date(`${dateStr}T00:00:00`).getTime();
  return isNaN(t) ? null : t;
}

function daysSince(dateStr, now) {
  const t = toTime(dateStr);
  return t === null ? null : Math.floor((now - t) / DAY_MS);
}

/**
 * @param pastDates  appointment dates ("YYYY-MM-DD"), today or earlier only;
 *                   order and duplicates do not matter
 * @param manualQuiet          automations.quiet === true
 * @param manualQuietEndedAt   automations.quiet_ended_at (ISO) or null
 * @param now                  ms epoch, injectable for tests
 * @returns { quietNow, comebackDue, quietStart, quietEnd }
 *   quietStart: last appointment date BEFORE the break - clients seen after
 *   it do not need a comeback message. quietEnd: when activity resumed.
 */
export function quietStatus({ pastDates = [], manualQuiet = false, manualQuietEndedAt = null, now = Date.now() } = {}) {
  const dates = [...new Set(pastDates.filter(Boolean))].sort();
  const last = dates[dates.length - 1] || null;

  // Quiet right now: her word, or a calendar with history that has gone dark.
  const autoQuietNow = !!last && daysSince(last, now) >= QUIET_GAP_DAYS;
  const quietNow = manualQuiet === true || autoQuietNow;
  if (quietNow) return { quietNow: true, comebackDue: false, quietStart: null, quietEnd: null };

  // Manual end wins when it is in the window: she declared the break, so its
  // end is exact. quietStart falls back to the last appointment before it.
  if (manualQuietEndedAt) {
    const endedMs = new Date(manualQuietEndedAt).getTime();
    if (!isNaN(endedMs)) {
      const sinceEnd = Math.floor((now - endedMs) / DAY_MS);
      if (sinceEnd >= COMEBACK_WAIT_DAYS && sinceEnd <= COMEBACK_WINDOW_DAYS) {
        const before = dates.filter((d) => toTime(d) < endedMs);
        return {
          quietNow: false,
          comebackDue: true,
          quietStart: before[before.length - 1] || null,
          quietEnd: manualQuietEndedAt.slice(0, 10),
        };
      }
      if (sinceEnd < COMEBACK_WAIT_DAYS) {
        // Still inside the wait - not due YET, and the automatic scan below
        // must not fire early off the same break.
        return { quietNow: false, comebackDue: false, quietStart: null, quietEnd: null };
      }
    }
  }

  // Automatic: the LATEST gap of QUIET_GAP_DAYS+ between consecutive
  // appointments whose end (first appointment back) is inside the window.
  for (let i = dates.length - 1; i > 0; i--) {
    const gapDays = (toTime(dates[i]) - toTime(dates[i - 1])) / DAY_MS;
    if (gapDays < QUIET_GAP_DAYS) continue;
    const sinceResume = daysSince(dates[i], now);
    if (sinceResume >= COMEBACK_WAIT_DAYS && sinceResume <= COMEBACK_WINDOW_DAYS) {
      return { quietNow: false, comebackDue: true, quietStart: dates[i - 1], quietEnd: dates[i] };
    }
    break; // only the latest break matters; older ones are history
  }

  return { quietNow: false, comebackDue: false, quietStart: null, quietEnd: null };
}
