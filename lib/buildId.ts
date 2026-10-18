// lib/buildId.ts
// The id of the deployment this code was built for. NEXT_PUBLIC_BUILD_ID is fixed at build time (next.config.ts), so
// the browser bundle and the server agree for one deployment and differ across deployments. 'dev' locally: the update
// banner never shows there.
export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';
