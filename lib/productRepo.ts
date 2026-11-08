// lib/productRepo.ts
//
// SERVER ONLY. The service-role implementation of ProductRepo (lib/productService.ts). Every statement names the tenant it acts
// for; the caller (app/api/products) took that tenant from the signed-in session and checked her plan before building this.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductRepo } from './productService.ts';
import type { ProductRow } from './products.ts';
import { PRODUCT_COLS } from './products.ts';

export function supabaseProductRepo(db: SupabaseClient): ProductRepo {
  return {
    async list(tenantId) {
      const { data, error } = await db.from('products').select(PRODUCT_COLS).eq('tenant_id', tenantId).order('name', { ascending: true }).limit(1000);
      return { rows: (data || []) as unknown as ProductRow[], error };
    },
    async findRecentDuplicate(tenantId, name, brand, sinceIso) {
      let q = db.from('products').select(PRODUCT_COLS).eq('tenant_id', tenantId).eq('name', name).is('archived_at', null).gte('created_at', sinceIso);
      q = brand ? q.eq('brand', brand) : q.is('brand', null);
      const { data, error } = await q.limit(1);
      if (error || !data || !data.length) return null;
      return data[0] as unknown as ProductRow;
    },
    async insert(row) {
      const { data, error } = await db.from('products').insert(row).select(PRODUCT_COLS).single();
      return { row: (data || null) as unknown as ProductRow | null, error };
    },
    async update(tenantId, id, patch) {
      const { data, error } = await db.from('products').update(patch).eq('id', id).eq('tenant_id', tenantId).select(PRODUCT_COLS);
      return { row: ((data && data[0]) || null) as unknown as ProductRow | null, error };
    },
    async rpc(fn, args) {
      const { data, error } = await db.rpc(fn, args);
      return { data, error };
    },
  };
}
