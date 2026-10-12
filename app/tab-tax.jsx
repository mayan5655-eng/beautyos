"use client";
// app/tab-tax.jsx
// Moved out of beautyos.jsx unchanged (perf/split-monolith): this screen is not part of the first paint, so it is
// loaded the first time it is opened. It receives exactly the values it used to close over, as props.
import React from "react";
import { parseDb } from "@/lib/dbTime";
import { BANNER_WIDE, BANNER_WIDE_W, BANNER_WIDE_H } from "@/lib/brand";
import BrandImage from "@/app/BrandImage";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";
import DeferredGate from "./DeferredGate";
import Icon from "./Icon";
import { effectiveMode, periodFilter, periodLabel, incomeTotals } from "@/lib/incomePeriod";

export default function TaxTab(props) {
  const {
    EXPENSE_CATEGORIES,
    MONTHS_HE,
    TAX_DISCLAIMER,
    VAT_RATE,
    deferred,
    expenses,
    handleAddExpense,
    handleDeleteExpense,
    isBusy,
    liveRcpts,
    loadDeferred,
    newExpense,
    openSettings,
    pc,
    pcDeep,
    pcGrad,
    pcTint,
    setNewExpense,
    setTaxPeriodIdx,
    setTaxPeriodMode,
    setTaxYear,
    settings,
    taxPeriodIdx,
    taxPeriodMode,
    taxYear,
  } = props;
  return (
(()=>{
            // expenses arrive after first render (loadDeferred); zero expenses
            // and not-loaded-yet must not look the same on a tax screen.
            if (deferred.expenses !== "ok") return <div className="glass-card" style={{padding:18}}><DeferredGate status={deferred.expenses} what="את ההוצאות" onRetry={loadDeferred}/></div>;
            // No registration chosen: say so and ask, instead of reporting her as an exempt dealer.
            if (!settings.business_tax_status) return (
              <div className="glass-card" style={{padding:18}}>
                <p className="serif" style={{fontSize:"var(--t-lg)",fontWeight:600,color:"var(--ink)",marginBottom:6}}>סיכום הכנסות</p>
                <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",lineHeight:1.6,marginBottom:12}}>כדי לחשב את הסיכום צריך לדעת איזה סוג עוסק את: פטור, מורשה או חברה. עוד לא בחרת, ואנחנו לא מנחשים.</p>
                <button onClick={()=>openSettings("general")} className="primary-btn" style={{padding:"10px 18px",background:pcGrad,color:"var(--pc-contrast)",fontSize:"var(--t-sm)"}}>לבחירת סטטוס עוסק</button>
              </div>
            );
            const status = settings.business_tax_status;
            const statusLabel = status==="exempt"?"עוסק פטור":status==="licensed"?"עוסק מורשה":"חברה בע\"מ";
            const years = Array.from({length:4},(_,i)=>(new Date().getFullYear())-i);
            const inYear = liveRcpts.filter(r=>r.created_at && parseDb(r.created_at).getFullYear()===taxYear);
            // Two concerns, kept apart (lib/incomePeriod.js): her registration decides how she REPORTS VAT (a year for an
            // exempt dealer, bi-monthly for the others), never what income she may LOOK at - month by month is for everyone.
            // And for an exempt dealer what she took IS her turnover: no VAT is carved out of it.
            const mode = effectiveMode(status, taxPeriodMode);
            const inPeriod = periodFilter({mode, idx:taxPeriodIdx});
            const periodReceipts = inYear.filter(r=>inPeriod(parseDb(r.created_at)));
            const rangeLabel = periodLabel({mode, idx:taxPeriodIdx, year:taxYear, monthNames:MONTHS_HE});
            const { gross, net, vatDue, count } = incomeTotals(periodReceipts.map(r=>r.amount), status, VAT_RATE);
            const yearGross = incomeTotals(inYear.map(r=>r.amount), status, VAT_RATE).gross;
            // Expenses filtered to the SAME period (by expense_date) — used for the
            // list below and for input VAT (step C). expense_date is "YYYY-MM-DD".
            const exYear=(e)=>Number((e.expense_date||"").slice(0,4));
            const exMonth=(e)=>Number((e.expense_date||"").slice(5,7))-1;
            const periodExpenses = status==="exempt" ? []
              : taxPeriodMode==="monthly"
                ? expenses.filter(e=>exYear(e)===taxYear && exMonth(e)===taxPeriodIdx)
                : expenses.filter(e=>exYear(e)===taxYear && Math.floor(exMonth(e)/2)===taxPeriodIdx);
            const expensesTotal = periodExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
            // Input VAT extracted from expenses (same formula as output VAT).
            const inputVat = expensesTotal*VAT_RATE/(1+VAT_RATE);
            const finalVat = vatDue - inputVat;      // output VAT minus input VAT
            const isRefund = finalVat < 0;           // negative => refund from the authority
            const nis=(x)=>`₪${Math.round(x).toLocaleString()}`;
            const Stat=({label,value,big,gold})=>(
 <div style={{flex:1,minWidth:120,background:gold?"var(--pc-tint)":"var(--surface-2)",border:`1px solid ${gold?pc:"var(--line)"}`,borderRadius:"var(--r-md)",padding:"16px 14px",textAlign:"center"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,marginBottom:7,letterSpacing:"0.3px"}}>{label}</p>
 <p className="serif" style={{fontSize:big?"var(--t-hero)":"var(--t-2xl)",fontWeight:600,color:gold?pcDeep:"var(--ink)",lineHeight:1}}>{value}</p>
 </div>
            );
            return (
 <div style={{maxWidth:720,marginLeft:"auto",marginRight:"auto"}}>
 <div style={{textAlign:"center",marginBottom:6}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600,letterSpacing:"0.04em",marginBottom:4}}>ניהול פיננסי</p>
 {/* "סיכום הכנסות", not "דוחות מס". Nothing on this screen is a document
     she can file: it sums receipts by period and estimates VAT. The old
     name claimed otherwise. The accountant's answer decides what a real
     report needs; until then the screen says what it is. */}
 <h2 className="serif" style={{fontSize:"var(--t-3xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>סיכום הכנסות</h2>
 </div>
 <p style={{textAlign:"center",fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:16}}>סטטוס העסק: <b style={{color:pcDeep}}>{statusLabel}</b> · ניתן לשנות בהגדרות</p>

                {/* CONTROLS */}
 <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:14}}>
 <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {years.map(y=>(
 <button key={y} onClick={()=>setTaxYear(y)} style={{padding:"7px 15px",borderRadius:"var(--r-lg)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:taxYear===y?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:taxYear===y?"var(--pc-tint)":"var(--surface)",color:taxYear===y?pcDeep:"var(--ink-2)",boxShadow:"var(--shadow-xs)"}}>{y}</button>
                    ))}
 </div>
 </div>
                {(
 <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",alignItems:"center",marginBottom:16}}>
 <div style={{display:"flex",gap:3,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-lg)",padding:4,boxShadow:"var(--shadow-xs)"}}>
 {status==="exempt"
   ? <button onClick={()=>{setTaxPeriodMode("annual");}} style={{padding:"6px 13px",borderRadius:"var(--r-md)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:mode==="annual"?pcGrad:"transparent",color:mode==="annual"?"var(--pc-contrast)":"var(--ink-2)"}}>שנתי</button>
   : <button onClick={()=>{setTaxPeriodMode("bimonthly");setTaxPeriodIdx(Math.floor(new Date().getMonth()/2));}} style={{padding:"6px 13px",borderRadius:"var(--r-md)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:taxPeriodMode==="bimonthly"?pcGrad:"transparent",color:taxPeriodMode==="bimonthly"?"var(--pc-contrast)":"var(--ink-2)"}}>דו-חודשי</button>}
 <button onClick={()=>{setTaxPeriodMode("monthly");setTaxPeriodIdx(new Date().getMonth());}} style={{padding:"6px 13px",borderRadius:"var(--r-md)",fontSize:"var(--t-xs)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:taxPeriodMode==="monthly"?pcGrad:"transparent",color:taxPeriodMode==="monthly"?"var(--pc-contrast)":"var(--ink-2)"}}>חודשי</button>
 </div>
 {mode!=="annual"&&<select value={taxPeriodIdx} onChange={e=>setTaxPeriodIdx(Number(e.target.value))} style={{border:"1px solid var(--line-2)",borderRadius:"var(--r-lg)",padding:"8px 13px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:"var(--surface)",color:"var(--ink)",cursor:"pointer",boxShadow:"var(--shadow-xs)"}}>
                      {taxPeriodMode==="monthly"
                        ? MONTHS_HE.map((m,i)=><option key={i} value={i}>{m}</option>)
                        : Array.from({length:6},(_,i)=><option key={i} value={i}>{MONTHS_HE[i*2]}–{MONTHS_HE[i*2+1]}</option>)}
 </select>}
 </div>
                )}

                {/* PRINT / PDF */}
 <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
 <button onClick={()=>window.print()} className="primary-btn" style={{background:pcGrad,color:"var(--pc-contrast)",padding:"10px 22px",fontSize:"var(--t-sm)",display:"inline-flex",alignItems:"center",gap:8}}>
 <svg viewBox="0 0 24 24" width="16" height="16" style={{fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"}}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>
                    הורדת PDF / הדפסה
 </button>
 </div>

                {/* REPORT CARD */}
 <div id="tax-report" style={{background:"var(--surface)",borderRadius:"var(--r-lg)",border:"1px solid var(--line)",boxShadow:"var(--shadow-md)",padding:"26px 24px"}}>
 <div style={{textAlign:"center",marginBottom:18}}>
 <BrandImage src={BANNER_WIDE} alt="" width={BANNER_WIDE_W} height={BANNER_WIDE_H} sizes="280px" style={{width:"100%",maxWidth:280,height:"auto",margin:"0 auto 12px",display:"block"}}/>
 <p className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em"}}>{settings.business_name||"העסק"} — {statusLabel}</p>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginTop:3}}>תקופת הדיווח: {rangeLabel}</p>
 </div>
                  {status==="exempt"?(
 <>
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      <Stat label={mode==="annual"?"מחזור שנתי (ללא מע\"מ)":"מחזור החודש (ללא מע\"מ)"} value={nis(gross)} big gold/>
 <Stat label="מספר עסקאות" value={count}/>
 </div>
                    {mode==="monthly"&&(
 <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:12}}>
                        <Stat label={`מחזור שנתי ${taxYear} (ללא מע"מ)`} value={nis(yearGross)}/>
 </div>
                    )}
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:14,lineHeight:1.6,textAlign:"center"}}>עוסק פטור לא גובה מע"מ, ולכן המחזור הוא הסכום שנגבה, בלי ניכוי. הדיווח שלך הוא שנתי; החיתוך לפי חודש כאן הוא לנוחותך.</p>
 </>
                  ):(
 <>
 <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
 <Stat label={"מחזור ברוטו (כולל מע\"מ)"} value={nis(gross)}/>
 <Stat label={"מחזור נטו (לפני מע\"מ)"} value={nis(net)}/>
 <Stat label="מספר עסקאות" value={count}/>
 </div>
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        <Stat label={`מס עסקאות (מע\"מ ${Math.round(VAT_RATE*100)}%)`} value={nis(vatDue)}/>
 <Stat label="מס תשומות (על הוצאות)" value={nis(inputVat)}/>
 <Stat label={isRefund?"החזר מע\"מ":"מע\"מ סופי לתשלום"} value={nis(Math.abs(finalVat))} big gold/>
 </div>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",marginTop:14,lineHeight:1.6,textAlign:"center"}}>{`מע"מ סופי = מס עסקאות (מהמכירות) פחות מס תשומות (חילוץ ה-${Math.round(VAT_RATE*100)}% מסך ההוצאות שנרשמו לתקופה). ${isRefund?"התוצאה שלילית — כלומר מגיע לך החזר מע\"מ מהרשויות.":"זהו הסכום לתשלום לרשויות בגין התקופה."}`}</p>
 </>
                  )}

                  {/* LEGAL DISCLAIMER */}
 <div style={{marginTop:20,padding:"12px 14px",background:"rgba(242,184,75,0.12)",border:"1px solid rgba(242,184,75,0.35)",borderRadius:"var(--r-sm)"}}>
 <p style={{fontSize:"var(--t-sm)",color:"var(--warning)",lineHeight:1.6,textAlign:"center"}}><Icon name="warning" size={13}/> {TAX_DISCLAIMER}</p>
 </div>
 </div>

                {/* EXPENSES (licensed/company only) — outside #tax-report so it stays out of the PDF */}
                {status!=="exempt"&&(
 <div style={{marginTop:22}}>
 <h3 className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:"var(--ink)",letterSpacing:"-0.01em",marginBottom:4}}>הוצאות העסק — {rangeLabel}</h3>
 <p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:12}}>הוצאות (כולל מע"מ) משמשות לחישוב מס התשומות. ההוצאות מסוננות לתקופת הדוח שנבחרה למעלה.</p>

                    {/* ADD FORM */}
 <div className="glass-card" style={{padding:"14px 16px",marginBottom:12}}>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
 <div style={{flex:"1 1 110px"}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>סכום (כולל מע"מ)</p><input type="number" value={newExpense.amount} onChange={e=>setNewExpense({...newExpense,amount:e.target.value})} placeholder="0" style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"ltr",textAlign:"right",background:pcTint}}/></div>
 <div style={{flex:"1 1 130px"}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>תאריך</p><input type="date" value={newExpense.expense_date} onChange={e=>setNewExpense({...newExpense,expense_date:e.target.value})} style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",background:pcTint}}/></div>
 <div style={{flex:"2 1 160px"}}><p style={{fontSize:"var(--t-sm)",color:"var(--ink-2)",marginBottom:3}}>תיאור</p><input value={newExpense.description} onChange={e=>setNewExpense({...newExpense,description:e.target.value})} placeholder="למשל: חומרים מספק" style={{width:"100%",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"8px 10px",fontSize:"var(--t-sm)",fontFamily:"inherit",outline:"none",direction:"rtl",background:pcTint}}/></div>
 </div>
 <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",fontWeight:600}}>קטגוריה:</span>
                        {EXPENSE_CATEGORIES.map(cat=>{
                          const sel=newExpense.category===cat.k;
                          return <button key={cat.k} onClick={()=>setNewExpense({...newExpense,category:cat.k})} style={{padding:"5px 12px",borderRadius:"var(--r-md)",fontSize:"var(--t-sm)",fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:sel?`1.5px solid ${pc}`:"1px solid var(--line-2)",background:sel?"var(--pc-tint)":"var(--surface)",color:sel?pcDeep:"var(--ink-2)"}}>{cat.l}</button>;
                        })}
 <button onClick={handleAddExpense} disabled={isBusy("addExpense")} className="primary-btn" style={{marginRight:"auto",background:pcGrad,color:"var(--pc-contrast)",padding:"8px 18px",fontSize:"var(--t-sm)"}}>{isBusy("addExpense")?<Spinner inline label="מוסיף"/>:"הוספת הוצאה"}</button>
 </div>
 </div>

                    {/* LIST */}
                    {periodExpenses.length===0?(
  <EmptyState compact icon="receipt" accent={pc} accentTint={pcTint}
     title="לא רשמת הוצאות בתקופה הזו"
     body="חומרים, מכשירים, שכירות ופרסום מקטינים את המס. רישום שוטף שווה יותר מלשחזר הכל בסוף השנה."
     />
                    ):(<>
                      {[...periodExpenses].sort((a,b)=>String(b.expense_date||"").localeCompare(String(a.expense_date||""))).map(exp=>{
                        const catL=EXPENSE_CATEGORIES.find(c=>c.k===exp.category)?.l||"אחר";
                        return (
 <div key={exp.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:"var(--r-sm)",padding:"10px 13px",marginBottom:6,boxShadow:"var(--shadow-xs)"}}>
 <span style={{fontSize:"var(--t-sm)",color:"var(--ink-3)",width:74,flexShrink:0}}>{exp.expense_date}</span>
 <span className="pill" style={{fontSize:"var(--t-xs)",background:"var(--pc-tint)",color:pcDeep,padding:"2px 9px",flexShrink:0}}>{catL}</span>
 <span style={{flex:1,minWidth:0,fontSize:"var(--t-sm)",color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{exp.description||"—"}</span>
 <span className="serif" style={{fontSize:"var(--t-md)",fontWeight:600,color:"var(--ink)",flexShrink:0}}>{nis(Number(exp.amount)||0)}</span>
 <button onClick={()=>handleDeleteExpense(exp)} aria-label="מחיקת הוצאה" style={{background:"none",border:"none",color:"var(--danger)",fontSize:"var(--t-md)",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>✕</button>
 </div>
                        );
                      })}
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 13px",marginTop:5,background:"var(--pc-tint)",borderRadius:"var(--r-sm)"}}>
 <span style={{fontSize:"var(--t-sm)",fontWeight:600,color:"var(--ink-2)"}}>סך הוצאות בתקופה ({periodExpenses.length})</span>
 <span className="serif" style={{fontSize:"var(--t-xl)",fontWeight:600,color:pcDeep}}>{nis(expensesTotal)}</span>
 </div>
                    </>)}
 </div>
                )}
 </div>
            );
          })()
  );
}
