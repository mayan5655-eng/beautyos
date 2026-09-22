'use client';

// app/design/images.js
//
// Picture references inside a design and how the browser turns them into
// something an <img> can show. Two kinds: a public https URL (her branding
// uploads, AI images) shown as is, and a "private:<path>" reference to a
// client photo in the private bucket, exchanged for a one-hour signed URL
// here and never stored signed anywhere.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { PRIVATE_BUCKET, PUBLIC_BUCKET } from '@/lib/clientImages';
import { isPrivateRef, privatePath } from '@/lib/design/design';
import { resizeImage, IMAGE_PRESETS } from '@/lib/imageResize';

const cache = new Map(); // ref -> { url, until }

export async function resolveImageRef(ref) {
  if (!isPrivateRef(ref)) return ref || null;
  const hit = cache.get(ref);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(privatePath(ref), 3600);
  if (error || !data?.signedUrl) return null;
  cache.set(ref, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** { privateRef: signedUrl } for every private reference in a slot map. */
export function useResolvedImages(images) {
  const refs = Object.values(images || {}).filter(isPrivateRef);
  const key = refs.join('|');
  const [map, setMap] = useState({});
  useEffect(() => {
    let alive = true;
    if (key) {
      Promise.all(key.split('|').map(async (r) => [r, await resolveImageRef(r)])).then((pairs) => { if (alive) setMap((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); });
    }
    return () => { alive = false; };
  }, [key]);
  return map;
}

/** Upload a picture she chose from her device into her design folder; returns the public URL. */
export async function uploadDesignImage(file, tenantId) {
  if (!tenantId) throw new Error('חסר מזהה עסק');
  if (!/^image\//.test(file.type)) throw new Error('אפשר להעלות רק תמונות');
  if (file.size > 12 * 1024 * 1024) throw new Error('התמונה גדולה מדי (עד 12MB)');
  const blob = await resizeImage(file, IMAGE_PRESETS.gallery);
  const ext = /png/i.test(blob.type) ? 'png' : 'jpg';
  const path = `${tenantId}/designs/upload_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' });
  if (error) throw new Error(error.message);
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path)?.data?.publicUrl || '';
}

/** Her client photos, as private references, for the before/after slots. */
export async function listClientPhotos() {
  const { data, error } = await supabase
    .from('client_photos')
    .select('id, client_id, before_url, after_url, treatment, created_at')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) return [];
  const asRef = (p) => (p ? `private:${String(p).replace(/^private:/, '')}` : null);
  return (data || []).map((r) => ({ id: r.id, clientId: r.client_id, before: asRef(r.before_url), after: asRef(r.after_url), treatment: r.treatment || '', createdAt: r.created_at }));
}
