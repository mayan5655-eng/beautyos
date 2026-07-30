"use client";
// app/usePlanState.js
// Reads this tenant's plan state in a client component that is NOT beautyos.jsx.
//
// The main app already loads the tenants row inside loadAll and derives state
// there, so it does not need this. The standalone dashboard pages (leads,
// marketing, campaign detail) have no such loader, so they use this hook.
//
// Reads are deliberately left open by the write-block policies, so this works
// exactly the same for a blocked tenant, which is the whole point: she must be
// able to see her data and be told why she cannot change it.
//
// FAILS OPEN. Until the row resolves, and on any error, `readOnly` is false, so
// a slow or failing read never disables her controls.

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { planState } from "@/lib/planState";

export default function usePlanState() {
  const [planRow, setPlanRow] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: tenantId } = await supabase.rpc("get_user_tenant_id");
        if (!tenantId || cancelled) return;
        // select("*") on purpose: the plan columns come from trial-state.sql,
        // run by hand, so naming them would break where it has not been run.
        const { data } = await supabase
          .from("tenants")
          .select("*")
          .eq("id", tenantId)
          .maybeSingle();
        if (!cancelled) setPlanRow(data || null);
      } catch {
        // Swallowed on purpose: failing open is the correct direction here.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const plan = planState(planRow);
  return { plan, readOnly: plan.isBlocked };
}
