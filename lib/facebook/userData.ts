// lib/facebook/userData.ts
//
// SERVER ONLY. What "this Facebook user removed the app" and "this Facebook user asked for deletion" do to what
// Kalmea holds, with the database injected so it is testable.
//
// What Kalmea stores about a Facebook user: the Page connections she made (facebook_pages: page id and name, the
// encrypted Page token and, when present, the encrypted user token and her app-scoped user id). That is all of it.
//   deauthorize  -> the connections made by that user are switched off and the stored tokens are wiped; the rows
//                   stay so the business sees "disconnected" and can reconnect.
//   deletion     -> those rows are removed entirely.
// Lead records belong to the business that ran the ad, not to the Facebook user who connected the Page, and are
// kept; the privacy page says how a person who filled in a lead form asks for theirs to be removed.
//
// Matching is by the stored app-scoped user id (facebook_pages.fb_user_id, add_facebook_user_token.sql). Rows
// connected before that column existed carry no id and cannot be matched: the result says so honestly.

export type FbDb = {
  from: (table: string) => any; // supabase-js query builder
};

export type UserDataResult = { matched: number; columnMissing: boolean };

const isMissingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42703' || /fb_user_id|column|schema cache/i.test(e.message || ''));

export async function deauthorizeFacebookUser(db: FbDb, fbUserId: string, encryptedPlaceholder: string): Promise<UserDataResult> {
  const { data, error } = await db.from('facebook_pages')
    .update({ is_active: false, page_access_token_encrypted: encryptedPlaceholder, user_access_token_encrypted: null })
    .eq('fb_user_id', fbUserId)
    .select('id');
  if (error) {
    if (isMissingColumn(error)) return { matched: 0, columnMissing: true };
    throw new Error(error.message);
  }
  return { matched: (data || []).length, columnMissing: false };
}

export async function deleteFacebookUserData(db: FbDb, fbUserId: string): Promise<UserDataResult> {
  const { data, error } = await db.from('facebook_pages').delete().eq('fb_user_id', fbUserId).select('id');
  if (error) {
    if (isMissingColumn(error)) return { matched: 0, columnMissing: true };
    throw new Error(error.message);
  }
  return { matched: (data || []).length, columnMissing: false };
}
