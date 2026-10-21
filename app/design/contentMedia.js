'use client';

// app/design/contentMedia.js
//
// The picture a scheduled post publishes, prepared in her browser and stored in HER private folder
// (client-images/<tenant>/content/<item>_<time>.jpg), where only the server signs a short-lived link for Meta.
//
// Instagram's API publishes JPEG images only, with a width/height ratio between 4:5 (0.8) and 1.91:1. So every picture,
// her own upload or a card drawn from a template, is redrawn here as a JPEG, at most 1440 px wide, and a picture outside
// those ratios gets soft margins in a neutral colour instead of being cropped: nothing of her photo is cut off.

import { supabase } from '../supabase';
import { PRIVATE_BUCKET } from '@/lib/clientImages';
import { fitForInstagram } from '@/lib/content/media';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('לא הצלחנו לקרוא את התמונה. אפשר לנסות קובץ JPG או PNG.')); };
    img.src = url;
  });
}

/** Any image (File or Blob) as an Instagram-ready JPEG Blob. */
export async function toInstagramJpeg(blob) {
  if (!blob || !/^image\//.test(blob.type || 'image/')) throw new Error('צריך לבחור קובץ תמונה');
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('התמונה גדולה מדי (עד 15MB)');
  const img = await loadImage(blob);
  const f = fitForInstagram(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = f.W; canvas.height = f.H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FBF8F1';
  ctx.fillRect(0, 0, f.W, f.H);
  ctx.drawImage(img, f.x, f.y, f.dw, f.dh);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('הכנת התמונה נכשלה'))), 'image/jpeg', 0.9));
}

/** Stores the post's picture in her folder; returns the storage path the server checks and publishes. */
export async function uploadPostPicture(blob, tenantId, itemId) {
  if (!tenantId) throw new Error('לא זוהה עסק');
  const jpeg = await toInstagramJpeg(blob);
  const path = `${tenantId}/content/${itemId}_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, jpeg, { contentType: 'image/jpeg' });
  if (error) throw new Error('לא הצלחנו לשמור את התמונה. נסי שוב.');
  return path;
}
