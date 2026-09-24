'use client';

// app/design/exportPng.js
//
// The PNG export for the DOM renderer: capture a full-size DomPreview
// (1080 wide, mounted off-screen by the caller) with html2canvas, the same
// library the post designer already uses. Returns a Blob; the caller
// downloads it and, when the design is saved, uploads it as export_path.

import { supabase } from '../supabase';
import { PUBLIC_BUCKET } from '@/lib/clientImages';
import { REFIT_EVENT } from './DomPreview';

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function captureElementPng(el) {
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  // Every text refits against the loaded fonts, then layout settles, then we capture.
  window.dispatchEvent(new Event(REFIT_EVENT));
  await frame(); await frame();
  await new Promise((r) => setTimeout(r, 60));
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(el, { scale: 1, useCORS: true, allowTaint: false, backgroundColor: null, logging: false });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('הייצוא נכשל'))), 'image/png'));
}

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
