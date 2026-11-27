"use client";
// app/sections/usePasswordSection.jsx — part of the owner's app: 24 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { tr } from "@/lib/i18n/tr";

export function usePasswordSection(ctx) {
  const {
    isBusy, pwConfirm, pwCurrent, pwNew, setBusyKey, setPwConfirm, setPwCurrent, setPwNew, toast,
  } = ctx;
  /* @section-body */const handleChangePassword = async () => {
    if (isBusy("changePw")) return;
    if (!pwCurrent || !pwNew || !pwConfirm) { toast(tr("חסר משהו, אפשר למלא את כל השדות"), "error"); return; }
    if (pwNew.length < 8) { toast(tr("הסיסמה החדשה חייבת להכיל לפחות 8 תווים"), "error"); return; }
    if (pwNew !== pwConfirm) { toast(tr("הסיסמאות אינן תואמות"), "error"); return; }
    setBusyKey("changePw", true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { toast(tr("לא זוהה משתמש מחובר"), "error"); return; }
      // Verify the current password by re-authenticating the same user.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwCurrent });
      if (reauthErr) { toast(tr("הסיסמה הנוכחית שגויה"), "error"); return; }
      const { error: updErr } = await supabase.auth.updateUser({ password: pwNew });
      if (updErr) {
        const sameAsOld = /should be different|New password/i.test(updErr.message || "");
        toast(sameAsOld ? tr("הסיסמה החדשה חייבת להיות שונה מהנוכחית") : tr("עדכון הסיסמה נכשל, נסי שוב"), "error");
        return;
      }
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      toast(tr("הסיסמה עודכנה ✓"));
    } finally {
      setBusyKey("changePw", false);
    }
  };/* @section-end */
  return { handleChangePassword };
}
