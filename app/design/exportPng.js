'use client';

// app/design/exportPng.js
//
// The export helpers. The PNG itself is drawn by canvasRender (no DOM
// rasterising: html2canvas laid text out on its own and dropped wrapped
// lines, scrambled letter-spaced Hebrew and could not draw a CSS mask). The
// caller downloads the Blob and, when the design is saved, uploads it.

import { supabase } from '../supabase';
import { PRIVATE_BUCKET, PUBLIC_BUCKET } from '@/lib/clientImages';
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Exports go to the PRIVATE bucket, under her tenant folder (the same per-tenant policy as her client photos).
// They used to go to the public community bucket: a render that contained consent-gated client photos became a
// publicly addressable file the moment she tapped export, even if she never posted it. Nothing in the app reads
// export_path back as a URL, so privacy costs nothing.
//
// The previous export of the same design is removed after the new one is stored, so re-exporting does not pile
// up files. Older exports may still sit in the public bucket (that is where they used to go), so the old path is
// removed from both; a failed removal is ignored, it must never fail the export.
async function removePrevious(previousPath) {
  if (!previousPath || typeof previousPath !== 'string') return;
  for (const bucket of [PRIVATE_BUCKET, PUBLIC_BUCKET]) {
    try { await supabase.storage.from(bucket).remove([previousPath]); } catch { /* best effort */ }
  }
}

/** Store the export in her private folder; returns the storage path. */
export async function uploadExport(blob, tenantId, designId, previousPath = null) {
  const path = `${tenantId}/designs/${designId}_${Date.now()}.png`;
  const { error } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, blob, { contentType: 'image/png' });
  if (error) throw new Error(error.message);
  await removePrevious(previousPath);
  return path;
}

/** Store a rendered reel next to her other assets; returns the storage path. */
export async function uploadReel(blob, tenantId, designId, ext = 'webm', previousPath = null) {
  const path = `${tenantId}/designs/${designId}_${Date.now()}.${ext === 'mp4' ? 'mp4' : 'webm'}`;
  const { error } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, blob, { contentType: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
  if (error) throw new Error(error.message);
  await removePrevious(previousPath);
  return path;
}
