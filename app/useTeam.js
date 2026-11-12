'use client';
// app/useTeam.js
//
// Her team for the owner's app (lib/team.ts, /api/team). With NEXT_PUBLIC_TEAM_CALENDAR off this never asks the server and
// answers { available: false, on: false, staff: [] }: nothing in the calendar changes. `on` is true only with two or more ACTIVE
// people (lib/team.ts teamOn); the calendar shows its filter, colours and "מטפלת" picker only then.
//
// Saving (the settings card) refreshes every screen that reads it through the "kalmea:team-changed" event.
import { useCallback, useEffect, useState } from "react";
import { teamCalendarEnabled } from "@/lib/teamFlag";
import { normalizeStaff, teamOn } from "@/lib/team";

export const TEAM_CHANGED = "kalmea:team-changed";
const OFF = { available: false, on: false, staff: [], loaded: false };

export function teamFromResponse(j) {
  if (!j || j.success !== true || j.available !== true || !Array.isArray(j.staff)) return { ...OFF, loaded: true };
  const staff = j.staff.map(normalizeStaff).filter(Boolean);
  return { available: true, on: teamOn(staff), staff, loaded: true };
}

export default function useTeam({ skip = false } = {}) {
  const enabled = teamCalendarEnabled() && !skip;
  const [state, setState] = useState(OFF);
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await fetch("/api/team", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      setState(teamFromResponse(j));
    } catch {
      // No network: one practitioner, as before. Never a broken calendar.
      setState({ ...OFF, loaded: true });
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    // After this render, not inside it: the answer arrives asynchronously either way.
    Promise.resolve().then(load);
    const on = () => load();
    window.addEventListener(TEAM_CHANGED, on);
    return () => window.removeEventListener(TEAM_CHANGED, on);
  }, [enabled, load]);
  return { ...state, enabled, reload: load, setFromResponse: (j) => setState(teamFromResponse(j)) };
}
