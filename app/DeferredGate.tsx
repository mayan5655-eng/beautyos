// app/DeferredGate.tsx
//
// Stands in for a screen's content while a deferred read (forms, expenses,
// waitlist - see loadDeferred in beautyos.jsx) has not arrived, or failed.
//
// The rule it enforces: "not loaded yet" and "loaded, and there are none" must
// never look the same. Rendering the empty list while the read is in flight
// would show a cosmetician with a year of expenses a tax screen that says she
// has none - the exact lie loadAll's CORE_READS check exists to prevent for the
// boot reads. A failed read says so, and offers the retry.

import Spinner from "./Spinner";
import { couldNotHe } from "@/lib/errorCopy";

export default function DeferredGate({
  status,
  what,
  onRetry,
}: {
  status: "loading" | "error" | "ok";
  /** Hebrew object phrase, e.g. "את ההוצאות" - read as "לטעון את ההוצאות". */
  what: string;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <div role="alert" style={{ padding: "18px 12px", textAlign: "center" }}>
        <p style={{ fontSize: "var(--t-sm)", color: "var(--ink-2)", marginBottom: 10 }}>{couldNotHe(`לטעון ${what}`)}</p>
        <button
          type="button"
          onClick={onRetry}
          className="primary-btn"
          style={{ padding: "8px 18px", fontSize: "var(--t-sm)", borderRadius: "var(--r-sm)", cursor: "pointer" }}
        >
          נסי שוב
        </button>
      </div>
    );
  }
  return (
    <div style={{ padding: "18px 12px", display: "flex", justifyContent: "center" }}>
      <Spinner label={`טוענת ${what}`} />
    </div>
  );
}
