// lib/productPublic.ts
//
// SERVER ONLY. The products a PUBLIC page may show (the skin-scan result, app/skin-scan/page.jsx): her active products that she
// tagged with a home-routine step, display fields only. The select names those columns and nothing else (PUBLIC_PRODUCT_COLS:
// name, brand, price, routine_types), and every row is rebuilt field by field (publicProductView), so cost price, stock level,
// threshold, SKU and ids never leave the server, whatever columns the table grows later. Out-of-stock products are shown like the
// rest: hiding them would tell anyone her stock.
import { productsVisible, publicProductView, isMissingProductSchema, PUBLIC_PRODUCT_COLS, type PublicProduct } from './products.ts';

type Reader = { from: (table: string) => any };

export async function loadPublicProducts(db: Reader, tenantId: string): Promise<PublicProduct[]> {
  const { data: settings, error: sErr } = await db.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (sErr || !productsVisible(settings)) return [];
  const { data, error } = await db.from('products').select(PUBLIC_PRODUCT_COLS).eq('tenant_id', tenantId).is('archived_at', null).order('name', { ascending: true }).limit(200);
  if (error) {
    if (!isMissingProductSchema(error)) console.warn('[products] public read failed:', error.message);
    return [];
  }
  return ((data || []) as Record<string, unknown>[])
    .map(publicProductView)
    .filter((p): p is PublicProduct => !!p && p.types.length > 0);
}
