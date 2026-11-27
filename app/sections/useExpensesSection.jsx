"use client";
// app/sections/useExpensesSection.jsx — part of the owner's app: 41 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { tr } from "@/lib/i18n/tr";

export function useExpensesSection(ctx) {
  const {
    askConfirm, guardWrite, handleDbError, isBusy, newExpense, setBusyKey, setExpenses, setNewExpense, toast,
  } = ctx;
  /* @section-body */const handleAddExpense = async () => {
    if (guardWrite()) return;
    const amt = Number(newExpense.amount);
    if(!amt || amt<=0){ toast(tr("חסר סכום, אפשר להקליד אותו"),"error"); return; }
    if(!Number.isFinite(amt) || amt>=10000000){ toast(tr("הסכום נראה גדול מדי, אפשר לבדוק אותו?"),"error"); return; }
    if(!newExpense.expense_date){ toast(tr("חסר תאריך, אפשר לבחור אחד"),"error"); return; }
    if(isBusy("addExpense")) return;
    setBusyKey("addExpense", true);
    try {
      const payload = {
        amount: amt,
        expense_date: newExpense.expense_date,
        description: (newExpense.description||"").trim(),
        category: newExpense.category,
      };
      const {data,error} = await supabase.from("expenses").insert([payload]).select();
      if(error){ handleDbError(error,"add expense"); return; }
      if(data) setExpenses(prev=>[...prev, data[0]]);
      // Keep the chosen date + category for the next entry; clear amount + text.
      setNewExpense(prev=>({...prev, amount:"", description:""}));
      toast(tr("ההוצאה נוספה"));
    } finally {
      setBusyKey("addExpense", false);
    }
  };

  const handleDeleteExpense = (exp) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("מחיקת הוצאה"),
      message: tr("למחוק את ההוצאה{0} (₪{1})?", [exp.description?` "${exp.description}"`:"", Number(exp.amount).toLocaleString()]),
      confirmText: tr("מחיקה"),
      danger: true,
      onConfirm: async () => {
        const {error} = await supabase.from("expenses").delete().eq("id", exp.id);
        if(error){ handleDbError(error,"delete expense"); return; }
        setExpenses(prev=>prev.filter(e=>e.id!==exp.id));
        toast(tr("ההוצאה נמחקה"));
      },
    });
  };/* @section-end */
  return { handleAddExpense, handleDeleteExpense };
}
