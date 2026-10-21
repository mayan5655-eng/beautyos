// lib/grow/growIps.ts
//
// Grow's published IP addresses, from https://developers.grow.business/reference/ip-address (read 2026-10-14,
// 2026-10-15 and 2026-10-21, unchanged: 30 rows, 18.156.94.176 listed twice, so 29 distinct). Kept in this one file so a change on Grow's side is a
// one-file edit, and GROW_WEBHOOK_IPS (comma-separated) can replace it without a deploy.
//
// What the page says: "The following IP addresses must be allowed at the firewall for testing and production
// transactions". It does not label test vs live, and it does not literally say these are the sources of webhooks;
// Grow's own email says to check requests against this list, which is what lib/grow/webhook.ts does.

export const GROW_IPS_SOURCE = 'https://developers.grow.business/reference/ip-address';
export const GROW_IPS_READ_ON = '2026-10-21';

export const GROW_IPS: readonly string[] = [
  '3.123.194.128', '3.124.62.248', '18.198.97.252', '3.75.43.49', '18.156.94.176', '18.158.107.17', '3.121.149.170',
  '3.76.166.104', '3.69.160.29', '3.78.79.166', '3.71.221.153', '3.78.131.18', '3.67.110.47', '18.192.112.151',
  '52.59.95.229', '18.158.145.146', '3.75.128.58', '3.78.28.179', '3.122.21.187', '3.66.126.119', '35.158.249.118',
  '52.29.70.254', '52.59.159.234', '3.76.183.119', '18.157.106.67', '18.197.238.68', '3.66.129.154', '3.77.123.153',
  '3.70.40.72',
];
