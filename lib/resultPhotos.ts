// lib/resultPhotos.ts: which storage paths app/api/results/photo may touch (pure, so the test can import it).

/** Only a file directly in this business's results folder, with a plain name. */
export function ownResultPath(tenantId: string, p: unknown): string | null {
  const s = String(p ?? '')
  return !!tenantId && s.startsWith(`${tenantId}/results/`) && /^[A-Za-z0-9_.-]+$/.test(s.slice(tenantId.length + 9)) && !s.includes('..') ? s : null
}
