// lib/design/shareEvent.js
//
// The one shape a save/share event may have (app/api/designs/share-event, supabase/migrations/add_share_events.sql).
// Anything else is dropped here, so a crafted request cannot write free text into the table.

export const SHARE_KINDS = ['image', 'video'];
export const SHARE_OUTCOMES = ['opened', 'shared', 'cancelled', 'gesture', 'failed', 'download', 'posted'];
// photo: "צילום אחרי טיפול" (app/design/PhotoToPost.jsx); ownreel: a reel from her own photos and clips (app/design/OwnReel.jsx).
export const SHARE_SOURCES = ['editor', 'advanced', 'reel', 'plan', 'mine', 'photo', 'ownreel'];

/** { kind, outcome, can_share, source } or null when kind/outcome is not one we know. */
export function cleanShareEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!SHARE_KINDS.includes(raw.kind) || !SHARE_OUTCOMES.includes(raw.outcome)) return null;
  return {
    kind: raw.kind,
    outcome: raw.outcome,
    can_share: typeof raw.canShare === 'boolean' ? raw.canShare : null,
    source: SHARE_SOURCES.includes(raw.source) ? raw.source : null,
  };
}
