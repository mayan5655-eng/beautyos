"use client";
// app/sections/useSlugSection.jsx — part of the owner's app: 45 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { STUCK_HE } from "@/lib/errorCopy";
import { slugError } from "@/lib/slug";
import { tr } from "@/lib/i18n/tr";

export function useSlugSection(ctx) {
  const {
    guardWrite, handleDbError, planRow, setPlanRow, setSlugBusy, setSlugDraft, setSlugNote, settings, slugDraft,
    toast,
  } = ctx;
  /* @section-body */const mySlug = planRow?.slug || "";

  const saveSlug = async () => {
    if (guardWrite()) return;
    const want = String(slugDraft || "").trim();
    const tid = settings?.tenant_id;
    if (!tid) { toast(STUCK_HE,"error"); return; }
    const bad = slugError(want);
    if (!want) { toast(tr("כתבי כאן את הכתובת שתרצי"),"error"); return; }
    if (bad) { setSlugNote(bad); return; }
    if (want === mySlug) { setSlugDraft(null); setSlugNote(""); return; }

    setSlugBusy(true);
    setSlugNote("");
    try {
      // Is it taken? Asked through the same SECURITY DEFINER function the public
      // page resolves with, because an authenticated user cannot read another
      // tenant's row directly - and should not be able to. It returns id and
      // name only, which is all "taken by someone else" needs.
      const { data: hit } = await supabase.rpc("get_public_tenant_by_slug", { p_slug: want });
      const row = Array.isArray(hit) ? hit[0] : hit;
      if (row && String(row.id) !== String(tid)) { setSlugNote(tr("הכתובת הזו כבר תפוסה")); return; }

      // Through claim_tenant_slug (supabase/migrations/add_slug_claim_rpc.sql): the browser holds no UPDATE on
      // tenants.slug, so the direct update below was refused. While that function has not been run, fall back to
      // the direct write, which is what this did before.
      let { data, error } = await supabase.rpc("claim_tenant_slug", { p_slug: want });
      if (error && (error.code === "PGRST202" || error.code === "42883" || /claim_tenant_slug/.test(String(error.message||"")) && /find|exist|function/i.test(String(error.message||"")))) {
        ({ data, error } = await supabase.from("tenants").update({ slug: want }).eq("id", tid).select());
      }
      if (error) {
        // 23505: someone claimed it between the check above and this write.
        // 23514: the shape or reserved-word constraint refused it - the
        // database is the authority and lib/slug only fails fast.
        if (error.code === "23505") { setSlugNote(tr("מישהי הספיקה לתפוס את הכתובת הזו, אפשר לנסות אחרת.")); return; }
        if (error.code === "23514") { setSlugNote(tr("הכתובת הזו לא זמינה")); return; }
        handleDbError(error, "save slug"); return;
      }
      if (!data || !data[0]) { toast(tr("אין הרשאה לעדכן את כתובת העמוד"),"error"); return; }
      // the function returns { id, slug }; the direct update returned the whole row. Merge, never replace.
      setPlanRow(prev=>({...(prev||{}),...data[0]}));
      setSlugDraft(null);
      toast(tr("הכתובת נשמרה ✦"));
    } finally { setSlugBusy(false); }
  };/* @section-end */
  return { mySlug, saveSlug };
}
