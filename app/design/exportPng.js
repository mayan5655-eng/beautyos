'use client';

// app/design/exportPng.js
//
// The export helpers. The PNG itself is drawn by canvasRender (no DOM
// rasterising: html2canvas laid text out on its own and dropped wrapped
// lines, scrambled letter-spaced Hebrew and could not draw a CSS mask). The
// caller downloads the Blob and, when the design is saved, uploads it.

import { supabase } from '../supabase';
import { PUBLIC_BUCKET } from '@/lib/clientImages';
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Store the export next to her other assets; returns the storage path. */
export async function uploadExport(blob, tenantId, designId) {
  const path = `${tenantId}/designs/${designId}_${Date.now()}.png`;
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, blob, { contentType: 'image/png' });
  if (error) throw new Error(error.message);
  return path;
}

/** Store a rendered reel next to her other assets; returns the storage path. */
export async function uploadReel(blob, tenantId, designId, ext = 'webm') {
  const path = `${tenantId}/designs/${designId}_${Date.now()}.${ext === 'mp4' ? 'mp4' : 'webm'}`;
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, blob, { contentType: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
  if (error) throw new Error(error.message);
  return path;
}
