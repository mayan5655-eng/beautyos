// lib/logoSrc.js
//
// Where a public page should load her logo from. Her logo as uploaded is often an opaque JPEG
// on white, which sits in a white box on the cream the public pages are drawn on;
// app/logo/[key]/route.ts serves the same logo with that white background taken out (see
// lib/logoKnockout.ts). A hash of the stored URL goes in ?v= so a newly uploaded logo is a new
// URL and nothing stale is served. No sharp, no server code: this runs in the browser too.

export function logoSrc(logoUrl, tenantKey) {
  const url = String(logoUrl || "").trim();
  if (!url || !tenantKey) return url;
  // svg and webp are left as they are by the route; no reason to pay a round trip for them
  if (/\.(svg|webp)(\?|$)/i.test(url)) return url;
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return `/logo/${encodeURIComponent(tenantKey)}?v=${h.toString(36)}`;
}
