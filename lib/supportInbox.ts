// lib/supportInbox.ts
//
// The one check behind the nightly alert for support_messages: "an unseen
// support message for two days is worse than no button." Kept out of
// lib/invariants.js on purpose - that file's own rule is that a good
// invariant is one where a violation is INVISIBLE in the product, and a
// support message is the opposite of invisible, it is a person waiting for
// an answer. This is a backlog check, not a data-integrity one, so it is a
// separate function that app/api/invariants/route.js calls alongside
// runInvariants and folds into the same nightly WhatsApp, rather than a
// second alert channel to remember to check.

export type StaleSupportResult = {
  /** null when the table does not exist yet or the query failed - distinct
   *  from 0, which means "checked, and nothing is stuck". */
  count: number | null;
  oldestDays: number | null;
  error?: string;
};

/**
 * How many unhandled support_messages rows are older than `days`.
 *
 * Degrades to `{ count: null }` rather than throwing: support-messages.sql
 * may not be applied yet on every environment, and a missing table here must
 * not take down the whole nightly invariants run over an unrelated feature.
 */
export async function staleSupportMessages(
  db: { from: (t: string) => { select: (cols: string) => { is: (c: string, v: null) => { lt: (c: string, v: string) => Promise<{ data: { created_at: string }[] | null; error: { message: string } | null }> } } } },
  days = 2
): Promise<StaleSupportResult> {
  try {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await db
      .from('support_messages')
      .select('created_at')
      .is('handled_at', null)
      .lt('created_at', cutoff);

    if (error) {
      const missingTable =
        /support_messages/i.test(error.message) &&
        /does not exist|schema cache|relation/i.test(error.message);
      if (missingTable) return { count: null, oldestDays: null };
      return { count: null, oldestDays: null, error: error.message };
    }

    const rows = data || [];
    if (rows.length === 0) return { count: 0, oldestDays: null };

    const oldest = rows.reduce(
      (min, r) => Math.min(min, new Date(r.created_at).getTime()),
      Date.now()
    );
    const oldestDays = Math.floor((Date.now() - oldest) / 86_400_000);
    return { count: rows.length, oldestDays };
  } catch (err) {
    return { count: null, oldestDays: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** One line for the nightly WhatsApp report, or '' when there is nothing to say. */
export function formatStaleSupportLine(result: StaleSupportResult): string {
  if (!result.count) return '';
  return `פניות תמיכה ללא מענה מעל יומיים: ${result.count} (הישנה ביותר: לפני ${result.oldestDays} ימים) - dashboard/admin/support`;
}
